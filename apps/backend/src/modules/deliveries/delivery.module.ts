import { Module } from '@nestjs/common';
import { PrismaDeliveryApiRepository } from './adapters/prisma-delivery-api.repository';
import { DeliveryQueueModule } from './delivery-queue.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DELIVERY_API_REPOSITORY } from './ports/delivery-api.repository';

// 전달 조회·재시도·취소 API. API 서버만 import한다. 보내는 쪽은 delivery-worker.module.ts
@Module({
	imports: [DeliveryQueueModule],
	controllers: [DeliveryController],
	providers: [DeliveryService, { provide: DELIVERY_API_REPOSITORY, useClass: PrismaDeliveryApiRepository }],
})
export class DeliveryModule {}
