import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp, type IngressRequest } from './configure-app';

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

// 인그레스 경로(/in/)의 요청이 어떻게 들어오는지 그대로 돌려준다
@Controller('in')
class RawProbeController {
	@Post(':slug')
	@HttpCode(200)
	receive(@Req() request: IngressRequest) {
		return {
			is_buffer: Buffer.isBuffer(request.body),
			hex: request.body.toString('hex'),
			original_content_type: request.originalContentType ?? null,
		};
	}
}

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
		const post = (payload: Buffer | string | undefined, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: '/in/abc', payload, headers });

		it('JSON도 파싱하지 않고 받은 바이트 그대로 준다. 원래 Content-Type은 따로 남는다', async () => {
			const raw = '{ "a" :1 }';
			const response = await post(raw, { 'content-type': 'application/json; charset=utf-8' });
			expect(response.json()).toEqual({ is_buffer: true, hex: Buffer.from(raw).toString('hex'), original_content_type: 'application/json; charset=utf-8' });
		});

		it('깨진 JSON, 모르는 Content-Type, 글자가 아닌 바이트도 받는다', async () => {
			expect((await post('{not json', { 'content-type': 'application/json' })).json<{ hex: string }>().hex).toBe(Buffer.from('{not json').toString('hex'));
			expect((await post('<xml/>', { 'content-type': 'application/vnd.custom+xml' })).json<{ is_buffer: boolean }>().is_buffer).toBe(true);
			expect((await post(Buffer.from([0xff, 0xfe, 0x00]), { 'content-type': 'application/octet-stream' })).json<{ hex: string }>().hex).toBe('fffe00');
		});

		it('Content-Type이 없어도 받고, 본문이 없으면 빈 Buffer다', async () => {
			expect((await post('a=1')).json()).toMatchObject({ is_buffer: true, original_content_type: null });
			expect((await post(undefined)).json()).toEqual({ is_buffer: true, hex: '', original_content_type: null });
		});

		it('1MiB를 넘는 본문은 Fastify가 413으로 끊고 필터가 { code, message }로 낸다', async () => {
			const response = await post(Buffer.alloc(1024 * 1024 + 1), { 'content-type': 'application/json' });
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
