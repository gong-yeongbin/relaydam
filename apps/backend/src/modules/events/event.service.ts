import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { INCLUDED_EVENTS } from '@/common/plan-limits';
import { DELIVERY_QUEUE, type DeliveryQueue } from '@/modules/deliveries/ports/delivery.queue';
import { usagePeriod } from '@/modules/ingress/domain/usage-period';
import { INGRESS_COUNTERS, type IngressCounters } from '@/modules/ingress/ports/ingress.counters';
import { EVENT_REPOSITORY, type EventDetail, type EventFilter, type EventRepository, type EventRow } from './ports/event.repository';

const NOT_FOUND = { code: 'event_not_found', message: '이벤트가 없습니다.' };

@Injectable()
export class EventService {
	private readonly logger = new Logger(EventService.name);

	constructor(
		@Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
		@Inject(INGRESS_COUNTERS) private readonly counters: IngressCounters,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
	) {}

	async list(projectId: number, query: ListQueryDto & EventFilter): Promise<Page<EventRow>> {
		const filter = { source_id: query.source_id, received_after: query.received_after, received_before: query.received_before };
		const cursor = query.cursor === undefined ? null : BigInt(query.cursor);
		return toPage(await this.events.list(projectId, filter, cursor, query.limit + 1), query.limit, (e) => e.id);
	}

	async get(projectId: number, id: bigint): Promise<EventDetail> {
		return (await this.events.find(projectId, id)) ?? this.notFound();
	}

	async body(projectId: number, id: bigint): Promise<{ body: Buffer; content_type: string | null }> {
		return (await this.events.findBody(projectId, id)) ?? this.notFound();
	}

	// 그 웹훅이 지금 막 다시 들어온 것처럼 새 event를 만들어 소스에 지금 걸린 연결들로 보낸다.
	// 새 웹훅과 같으므로 사용량에 넣고 수신과 같은 규칙(정지·연결 없음·free 상한)을 본다. 근거는 context-notes.md "전달 정책"
	async replay(projectId: number, id: bigint, now: Date): Promise<EventRow> {
		const found = (await this.events.findForReplay(projectId, id)) ?? this.notFound();
		const { event, source, project } = found;
		if (project.suspended) throw new ForbiddenException({ code: 'project_suspended', message: '정지된 프로젝트입니다.' });
		// 소스가 지워졌으면 어느 연결로 보낼지 알 수 없다
		if (!source) throw new ConflictException({ code: 'source_deleted', message: '소스가 지워진 이벤트는 리플레이할 수 없습니다.' });
		if (source.connections.length === 0) throw new ConflictException({ code: 'no_connection', message: '연결된 목적지가 없습니다.' });

		const used = await this.counters.incrementUsage(project.organization_id, usagePeriod(now));
		if (project.plan === 'free' && used > INCLUDED_EVENTS.free) {
			throw new HttpException({ code: 'usage_exceeded', message: '이번 달 무료 사용량을 넘었습니다.' }, HttpStatus.TOO_MANY_REQUESTS);
		}

		const stored = await this.events.storeReplay({
			project_id: projectId,
			source_id: source.id,
			// 원본과 같은 멱등 키면 "같은 웹훅"으로 보고 만들지 않으므로 새로 만든다
			idempotency_key: `replay:${event.id}:${now.getTime()}`,
			method: event.method,
			path: event.path,
			query: event.query,
			// 받을 때 확인한 사실이라 원본 값을 그대로 옮긴다
			source_ip: event.source_ip,
			verified: event.verified,
			headers: event.headers as Prisma.InputJsonValue,
			body: Buffer.from(event.body),
			content_type: event.content_type,
			connections: source.connections,
		});
		// 저장은 끝났으므로 큐 적재가 실패해도 만든 것으로 답한다. 못 들어간 delivery는 sweeper가 다시 넣는다
		try {
			await this.queue.enqueue(stored.delivery_ids.map((delivery_id) => ({ delivery_id, trigger: 'initial' as const })));
		} catch (error) {
			this.logger.error(`delivery ${stored.delivery_ids.join(', ')} 큐 적재 실패: ${error instanceof Error ? error.message : String(error)}`);
		}
		return stored.event;
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
