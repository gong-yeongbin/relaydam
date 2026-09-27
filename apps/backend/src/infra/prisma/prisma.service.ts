import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
	constructor(config: ConfigService) {
		// Prisma 7은 드라이버 어댑터로만 접속한다. URL은 schema.prisma가 아니라 여기서 넘긴다.
		super({ adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }) });
	}

	// 드라이버 어댑터의 $connect()는 실제로 접속하지 않는다(DB가 없어도 성공한다).
	// 쿼리를 한 번 보내, DB에 닿지 못하면 첫 요청이 아니라 기동 단계에서 실패하게 한다.
	async onModuleInit(): Promise<void> {
		await this.$queryRaw`SELECT 1`;
	}

	async onModuleDestroy(): Promise<void> {
		await this.$disconnect();
	}
}
