import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// 모든 모듈의 adapters가 주입받으므로 전역으로 둔다.
@Global()
@Module({
	providers: [PrismaService],
	exports: [PrismaService],
})
export class PrismaModule {}
