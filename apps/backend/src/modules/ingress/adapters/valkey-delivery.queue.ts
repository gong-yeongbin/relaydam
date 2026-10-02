import { Injectable } from '@nestjs/common';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import type { DeliveryQueue } from '../ports/delivery.queue';

// 전달 워커(8. delivery)가 컨슈머 그룹으로 읽는 Stream. 항목은 delivery id 하나다
export const DELIVERY_STREAM = 'delivery';

@Injectable()
export class ValkeyDeliveryQueue implements DeliveryQueue {
	constructor(private readonly valkey: ValkeyService) {}

	async enqueue(deliveryIds: bigint[]): Promise<void> {
		const pipeline = this.valkey.pipeline();
		for (const id of deliveryIds) pipeline.xadd(DELIVERY_STREAM, '*', 'delivery_id', id.toString());
		await pipeline.exec();
	}
}
