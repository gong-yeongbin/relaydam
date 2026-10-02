import { loggerOptions } from './logger-options';

describe('loggerOptions', () => {
	afterEach(() => vi.unstubAllEnvs());

	const pinoHttp = () => loggerOptions().pinoHttp as { level: string; transport?: { target: string }; redact: { paths: string[] } };

	it('운영에서는 JSON 그대로 내고, 그 밖에서는 사람이 읽는 형태로 바꾼다', () => {
		vi.stubEnv('NODE_ENV', 'production');
		expect(pinoHttp().transport).toBeUndefined();

		vi.stubEnv('NODE_ENV', 'development');
		expect(pinoHttp().transport).toMatchObject({ target: 'pino-pretty' });
	});

	it('로그 레벨은 LOG_LEVEL을 따르고 없으면 info다', () => {
		vi.stubEnv('LOG_LEVEL', 'warn');
		expect(pinoHttp().level).toBe('warn');

		vi.stubEnv('LOG_LEVEL', undefined);
		expect(pinoHttp().level).toBe('info');
	});

	it('인증 헤더와 쿠키는 로그에서 가린다', () => {
		expect(pinoHttp().redact.paths).toEqual(['req.headers.authorization', 'req.headers.cookie']);
	});
});
