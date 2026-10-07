import { Module } from '@nestjs/common';
import { PrismaRetentionRepository } from './adapters/prisma-retention.repository';
import { RETENTION_REPOSITORY } from './ports/retention.repository';
import { RetentionRunner } from './retention.runner';

// 보존 배치. 워커 프로세스(consumer.module.ts)만 import한다
@Module({
	providers: [RetentionRunner, { provide: RETENTION_REPOSITORY, useClass: PrismaRetentionRepository }],
})
export class RetentionModule {}
