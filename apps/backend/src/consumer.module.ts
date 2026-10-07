import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from './common/logger-options';
import { CipherModule } from './infra/cipher/cipher.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { ValkeyModule } from './infra/valkey/valkey.module';
import { DeliveryWorkerModule } from './modules/deliveries/delivery-worker.module';
import { RetentionModule } from './modules/events/retention.module';

// 전달 워커 프로세스. HTTP 서버 없이 큐를 읽어 목적지로 보내고, 보존 배치를 돌린다. API 서버(app.module.ts)와 같은 이미지에서
// 진입점만 다르게 띄운다
@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true }), LoggerModule.forRoot(loggerOptions()), PrismaModule, ValkeyModule, CipherModule, DeliveryWorkerModule, RetentionModule],
})
export class ConsumerModule {}
