import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { EventDetail, EventFilter, EventRepository, EventRow, NewReplay, ReplaySource } from '../ports/event.repository';

// 본문은 목록·상세에 넣지 않는다
const WITHOUT_BODY = { body: true } as const;

@Injectable()
export class PrismaEventRepository implements EventRepository {
	constructor(private readonly prisma: PrismaService) {}

	list(projectId: number, filter: EventFilter, cursor: bigint | null, take: number): Promise<EventRow[]> {
		return this.prisma.event.findMany({
			where: {
				project_id: projectId,
				source_id: filter.source_id,
				received_at: { gte: filter.received_after, lt: filter.received_before },
				...(cursor === null ? {} : { id: { lt: cursor } }),
			},
			omit: WITHOUT_BODY,
			orderBy: { id: 'desc' },
			take,
		});
	}

	find(projectId: number, id: bigint): Promise<EventDetail | null> {
		return this.prisma.event.findFirst({ where: { id, project_id: projectId }, omit: WITHOUT_BODY, include: { deliveries: { orderBy: { id: 'asc' } } } });
	}

	async findBody(projectId: number, id: bigint): Promise<{ body: Buffer; content_type: string | null } | null> {
		const row = await this.prisma.event.findFirst({ where: { id, project_id: projectId }, select: { body: true, content_type: true } });
		return row && { body: Buffer.from(row.body), content_type: row.content_type };
	}

	async findForReplay(projectId: number, id: bigint): Promise<ReplaySource | null> {
		const row = await this.prisma.event.findFirst({
			where: { id, project_id: projectId },
			include: {
				source: { select: { id: true, connections: { select: { id: true, destination_id: true } } } },
				project: { select: { suspended_at: true, organization: { select: { id: true, plan: true } } } },
			},
		});
		if (!row) return null;
		const { source, project, ...event } = row;
		return {
			event,
			source,
			project: { organization_id: project.organization.id, plan: project.organization.plan, suspended: project.suspended_at !== null },
		};
	}

	storeReplay(replay: NewReplay): Promise<{ event: EventRow; delivery_ids: bigint[] }> {
		const { connections, body, ...columns } = replay;
		return this.prisma.$transaction(async (tx) => {
			const created = await tx.event.create({ data: { ...columns, body: new Uint8Array(body), size: body.length }, omit: WITHOUT_BODY });
			const deliveries = await tx.delivery.createManyAndReturn({
				data: connections.map((connection) => ({ event_id: created.id, destination_id: connection.destination_id, connection_id: connection.id })),
				select: { id: true },
			});
			return { event: created, delivery_ids: deliveries.map((delivery) => delivery.id) };
		});
	}
}
