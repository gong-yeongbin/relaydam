import { Readable } from 'node:stream';
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from './configure-app';
import { INGRESS_BODY_LIMIT, type IngressRequest, readIngressRequest } from './http/ingress-body';

@Controller('probe')
class ProbeController {
	@Get()
	get() {
		return { id: 1n };
	}

	@Post()
	@HttpCode(200)
	post(@Body() body: unknown) {
		return { body };
	}
}

// 인그레스 경로(/in/)의 요청이 핸들러에 어떻게 들어오는지 그대로 돌려준다
@Controller('in')
class RawProbeController {
	@Post(':slug')
	@HttpCode(200)
	receive(@Req() request: IngressRequest) {
		const { headers, body, size } = readIngressRequest(request);
		return {
			is_buffer: Buffer.isBuffer(body),
			// 큰 본문은 통째로 돌려주지 않는다
			hex: body.length <= 64 ? body.toString('hex') : null,
			body_length: body.length,
			size,
			content_type: headers['content-type'] ?? null,
			content_length: headers['content-length'] ?? null,
		};
	}
}

type Probe = { is_buffer: boolean; hex: string | null; body_length: number; size: number; content_type: string | null; content_length: string | null };

// 전역 설정이 실제 Fastify 앱에서 붙는지 본다. DB·가드 없이 컨트롤러만 띄운다.
describe('configureApp', () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ controllers: [ProbeController, RawProbeController] }).compile();
		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		configureApp(app);
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
	});

	afterAll(() => app.close());

	it('BigInt 인터셉터가 응답의 bigint를 문자열로 바꾼다', async () => {
		const response = await app.inject({ method: 'GET', url: '/probe' });
		expect(response.json()).toEqual({ id: '1' });
	});

	it('예외 필터가 { code, message }로 낸다', async () => {
		const response = await app.inject({ method: 'GET', url: '/nope' });
		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({ code: 'not_found', message: '찾을 수 없습니다.' });
	});

	it('Swagger 문서를 /docs에 연다', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs-json' });
		expect(response.json<{ paths: object }>().paths).toHaveProperty('/probe');
	});

	describe('인그레스 본문', () => {
		const post = async (payload: Buffer | string | undefined, headers: Record<string, string> = {}) => {
			const response = await app.inject({ method: 'POST', url: '/in/abc', payload, headers });
			return { status: response.statusCode, probe: response.json<Probe>() };
		};

		it('JSON도 파싱하지 않고 받은 바이트 그대로 준다. Content-Type은 원래 값이다', async () => {
			const raw = '{ "a" :1 }';
			const { probe } = await post(raw, { 'content-type': 'application/json; charset=utf-8' });
			expect(probe).toEqual({
				is_buffer: true,
				hex: Buffer.from(raw).toString('hex'),
				body_length: raw.length,
				size: raw.length,
				content_type: 'application/json; charset=utf-8',
				content_length: String(raw.length),
			});
		});

		it('깨진 JSON, 모르는 Content-Type, 글자가 아닌 바이트도 받는다', async () => {
			expect((await post('{not json', { 'content-type': 'application/json' })).probe.hex).toBe(Buffer.from('{not json').toString('hex'));
			expect((await post('<xml/>', { 'content-type': 'application/vnd.custom+xml' })).probe).toMatchObject({ is_buffer: true, content_type: 'application/vnd.custom+xml' });
			expect((await post(Buffer.from([0xff, 0xfe, 0x00]), { 'content-type': 'application/octet-stream' })).probe.hex).toBe('fffe00');
		});

		it('Content-Type이 없어도 받고, 본문이 없으면 빈 Buffer다', async () => {
			expect((await post('a=1')).probe).toMatchObject({ is_buffer: true, size: 3, content_type: null });
			expect((await post(undefined)).probe).toMatchObject({ is_buffer: true, hex: '', size: 0, content_type: null });
		});

		it('10MiB까지는 본문을 읽는다', async () => {
			const { status, probe } = await post(Buffer.alloc(INGRESS_BODY_LIMIT), { 'content-type': 'application/json' });
			expect(status).toBe(200);
			expect(probe).toMatchObject({ body_length: INGRESS_BODY_LIMIT, size: INGRESS_BODY_LIMIT });
		});

		it('Content-Length가 10MiB를 넘으면 본문을 읽지 않고 핸들러에 선언된 크기만 준다. 헤더는 원래 값이다', async () => {
			const { status, probe } = await post(Buffer.alloc(INGRESS_BODY_LIMIT + 1), { 'content-type': 'application/json' });
			expect(status).toBe(200);
			expect(probe).toEqual({
				is_buffer: true,
				hex: '',
				body_length: 0,
				size: INGRESS_BODY_LIMIT + 1,
				content_type: 'application/json',
				content_length: String(INGRESS_BODY_LIMIT + 1),
			});
		});

		it('Content-Length 없이(chunked) 10MiB를 넘기면 Fastify가 413으로 끊고 필터가 { code, message }로 낸다', async () => {
			const response = await app.inject({
				method: 'POST',
				url: '/in/abc',
				payload: Readable.from([Buffer.alloc(INGRESS_BODY_LIMIT), Buffer.alloc(1)]),
				headers: { 'content-type': 'application/json' },
			});
			expect(response.statusCode).toBe(413);
			expect(response.json()).toEqual({ code: 'payload_too_large', message: '요청 본문이 너무 큽니다.' });
		});
	});

	it('인그레스가 아닌 경로는 그대로 JSON을 파싱하고, 깨진 JSON은 400이다', async () => {
		const ok = await app.inject({ method: 'POST', url: '/probe', payload: '{"a":1}', headers: { 'content-type': 'application/json' } });
		expect(ok.json()).toEqual({ body: { a: 1 } });

		const broken = await app.inject({ method: 'POST', url: '/probe', payload: '{not json', headers: { 'content-type': 'application/json' } });
		expect(broken.statusCode).toBe(400);
		expect(broken.json<{ code: string }>().code).toBe('validation_failed');
	});
});
