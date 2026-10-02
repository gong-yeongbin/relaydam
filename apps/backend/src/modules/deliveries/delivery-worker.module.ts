import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeDestinationClient } from './adapters/node-destination.client';
import { PrismaDeliveryRepository } from './adapters/prisma-delivery.repository';
import { DeliveryQueueModule } from './delivery-queue.module';
import { DeliveryRunner } from './delivery.runner';
import { DeliveryWorker } from './delivery.worker';
import { APP_URL, DELIVERY_REPOSITORY } from './ports/delivery.repository';
import { DESTINATION_CLIENT } from './ports/destination.client';

// 전달 워커. 워커 프로세스(consumer.module.ts)만 import한다. API 서버는 큐를 읽지 않는다
@Module({
	imports: [DeliveryQueueModule],
	providers: [
		DeliveryWorker,
		DeliveryRunner,
		{ provide: DELIVERY_REPOSITORY, useClass: PrismaDeliveryRepository },
		{ provide: DESTINATION_CLIENT, useClass: NodeDestinationClient },
		{ provide: APP_URL, inject: [ConfigService], useFactory: (config: ConfigService) => config.getOrThrow<string>('APP_URL') },
	],
})
export class DeliveryWorkerModule {}
