import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValkeyService } from './valkey.service';

describe('ValkeyService', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('REDIS_URL이 없으면 생성 시 예외를 던진다', () => {
		// ConfigService는 process.env로 폴백하는데 test/setup.ts가 기본값을 채워 둔다
		vi.stubEnv('REDIS_URL', undefined);
		expect(() => new ValkeyService(new ConfigService({}))).toThrow('REDIS_URL');
	});

	it('생성할 때는 접속하지 않고, 모듈 초기화 때 접속하고 종료 때 끊는다', async () => {
		const service = new ValkeyService(new ConfigService({ REDIS_URL: 'redis://localhost:6379' }));
		expect(service.status).toBe('wait');
		const connect = vi.spyOn(service, 'connect').mockResolvedValue();
		const quit = vi.spyOn(service, 'quit').mockResolvedValue('OK');

		await service.onModuleInit();
		expect(connect).toHaveBeenCalledOnce();
		await service.onModuleDestroy();
		expect(quit).toHaveBeenCalledOnce();
	});

	// docker compose의 valkey 위에서 본다(`pnpm docker:up` 선행).
	it('(통합) 실제 Valkey에 접속해 값을 쓰고 읽는다', async () => {
		const service = new ValkeyService(new ConfigService({ REDIS_URL: process.env.REDIS_URL }));
		await service.onModuleInit();
		const key = `test:valkey:${randomUUID()}`;

		expect(await service.incr(key)).toBe(1);
		expect(await service.incr(key)).toBe(2);
		await service.del(key);

		// quit()은 응답을 받으면 끝나고, 연결이 실제로 닫히는 것은 그 뒤 'end' 이벤트다
		const ended = new Promise((resolve) => service.once('end', resolve));
		await service.onModuleDestroy();
		await ended;
		expect(service.status).toBe('end');
	});

	it('(통합) 닿지 않는 주소면 모듈 초기화가 실패하고 연결 오류를 로거로 남긴다', async () => {
		const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		const service = new ValkeyService(new ConfigService({ REDIS_URL: 'redis://localhost:1' }));
		// 기동 실패만 확인하면 되므로 재접속 시도는 끈다
		service.options.retryStrategy = () => null;

		await expect(service.onModuleInit()).rejects.toThrow();
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('Valkey 연결 오류'));
		logged.mockRestore();
	});
});
