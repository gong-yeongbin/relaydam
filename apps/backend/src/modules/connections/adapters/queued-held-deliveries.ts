import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { DELIVERY_QUEUE, type DeliveryQueue } from '@/modules/deliveries/ports/delivery.queue';
import type { HeldDeliveries } from '../ports/held-deliveries';

@Injectable()
export class QueuedHeldDeliveries implements HeldDeliveries {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
	) {}

	async release(connectionId: number): Promise<number> {
		const held = await this.prisma.delivery.findMany({ where: { connection_id: connectionId, status: 'held' }, select: { id: true } });
		const ids = held.map((delivery) => delivery.id);
		if (ids.length === 0) return 0;
		// 큐 적재가 실패해도 pending으로 남아 있으므로 sweeper가 다시 넣는다
		await this.prisma.delivery.updateMany({ where: { id: { in: ids }, status: 'held' }, data: { status: 'pending' } });
		await this.queue.enqueue(ids.map((delivery_id) => ({ delivery_id, trigger: 'unpause' as const })));
		return ids.length;
	}
}
