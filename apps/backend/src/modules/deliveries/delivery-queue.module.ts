import { Module } from '@nestjs/common';
import { ValkeyDeliveryQueue } from './adapters/valkey-delivery.queue';
import { DELIVERY_QUEUE } from './ports/delivery.queue';

// 전달 큐만 따로 낸다. 큐에 넣기만 하는 모듈(인그레스, 연결)과 읽는 워커가 같은 것을 쓴다
@Module({
	providers: [{ provide: DELIVERY_QUEUE, useClass: ValkeyDeliveryQueue }],
	exports: [DELIVERY_QUEUE],
})
export class DeliveryQueueModule {}
