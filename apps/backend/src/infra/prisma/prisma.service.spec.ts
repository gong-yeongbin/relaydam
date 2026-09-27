import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

// 실제 접속은 e2e 부팅 테스트가 docker compose의 postgres로 확인한다. 여기서는 생명주기 연결만 본다.
describe('PrismaService', () => {
	afterEach(() => vi.unstubAllEnvs());

	const config = new ConfigService({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' });

	it('DATABASE_URL이 없으면 생성 시 예외를 던진다', () => {
		// ConfigService는 process.env로 폴백하는데 test/setup.ts가 기본값을 채워 둔다
		vi.stubEnv('DATABASE_URL', undefined);
		expect(() => new PrismaService(new ConfigService({}))).toThrow('DATABASE_URL');
	});

	it('모듈 초기화 때 쿼리를 한 번 보내 접속을 확인한다', async () => {
		const service = new PrismaService(config);
		const query = vi.spyOn(service, '$queryRaw').mockResolvedValue([]);

		await service.onModuleInit();

		expect(query).toHaveBeenCalledOnce();
	});

	it('모듈 종료 때 접속을 끊는다', async () => {
		const service = new PrismaService(config);
		const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();

		await service.onModuleDestroy();

		expect(disconnect).toHaveBeenCalledOnce();
	});
});
