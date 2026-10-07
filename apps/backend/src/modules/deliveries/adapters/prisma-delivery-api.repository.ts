import { Injectable } from '@nestjs/common';
import type { delivery } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { BulkRetryFilter, DeliveryApiRepository, DeliveryDetail, DeliveryFilter } from '../ports/delivery-api.repository';

@Injectable()
export class PrismaDeliveryApiRepository implements DeliveryApiRepository {
	constructor(private readonly prisma: PrismaService) {}

	list(projectId: number, filter: DeliveryFilter, cursor: bigint | null, take: number): Promise<delivery[]> {
		return this.prisma.delivery.findMany({
			where: {
				event: { project_id: projectId },
				status: filter.status,
				destination_id: filter.destination_id,
				event_id: filter.event_id,
				...(cursor === null ? {} : { id: { lt: cursor } }),
			},
			orderBy: { id: 'desc' },
			take,
		});
	}

	find(projectId: number, id: bigint): Promise<DeliveryDetail | null> {
		return this.prisma.delivery.findFirst({ where: { id, event: { project_id: projectId } }, include: { attempts: { orderBy: { attempt_no: 'asc' } } } });
	}

	async markRetry(projectId: number, id: bigint): Promise<delivery | 'not_found' | 'pending'> {
		const [updated] = await this.prisma.delivery.updateManyAndReturn({
			where: { id, event: { project_id: projectId }, status: { not: 'pending' } },
			data: { status: 'pending', next_attempt_at: null },
		});
		if (updated) return updated;
		const current = await this.prisma.delivery.findFirst({ where: { id, event: { project_id: projectId } }, select: { id: true } });
		return current ? 'pending' : 'not_found';
	}

	async markBulkRetry(projectId: number, filter: BulkRetryFilter, limit: number): Promise<bigint[]> {
		const picked = await this.prisma.delivery.findMany({
			where: {
				event: { project_id: projectId },
				status: filter.status,
				destination_id: filter.destination_id,
				created_at: { gte: filter.created_after, lt: filter.created_before },
			},
			select: { id: true },
			orderBy: { id: 'asc' },
			take: limit,
		});
		if (picked.length === 0) return [];
		// 고르는 사이 상태가 바뀐 것은 건드리지 않는다
		const updated = await this.prisma.delivery.updateManyAndReturn({
			where: { id: { in: picked.map((row) => row.id) }, status: filter.status },
			data: { status: 'pending', next_attempt_at: null },
			select: { id: true },
		});
		return updated.map((row) => row.id);
	}

	async cancel(projectId: number, id: bigint): Promise<delivery | 'not_found' | 'closed'> {
		const [updated] = await this.prisma.delivery.updateManyAndReturn({
			where: { id, event: { project_id: projectId }, status: { in: ['pending', 'failed', 'held'] } },
			data: { status: 'canceled', next_attempt_at: null },
		});
		if (updated) return updated;
		const current = await this.prisma.delivery.findFirst({ where: { id, event: { project_id: projectId } }, select: { id: true } });
		return current ? 'closed' : 'not_found';
	}
}
