import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp } from './configure-app';

@Controller('probe')
class ProbeController {
	@Get()
	get() {
		return { id: 1n };
	}
}

// 전역 설정이 실제 Fastify 앱에서 붙는지 본다. DB·가드 없이 컨트롤러 하나만 띄운다.
describe('configureApp', () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
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
});
