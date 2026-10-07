import type { delivery, event, Plan, Prisma } from '@prisma/client';

// 목록·상세에 주는 event. 본문은 빼고 준다(최대 10MiB의 바이트라 JSON에 넣지 않는다). 본문은 GET .../body로 따로 준다
export type EventRow = Omit<event, 'body'>;
// 상세는 그 event의 delivery도 같이 준다
export type EventDetail = EventRow & { deliveries: delivery[] };
export type EventFilter = { source_id?: number; received_after?: Date; received_before?: Date };

// 리플레이 판단에 필요한 것. 소스가 지워졌으면 source는 null이다
export type ReplaySource = {
	event: event;
	source: { id: number; connections: { id: number; destination_id: number }[] } | null;
	project: { organization_id: number; plan: Plan; suspended: boolean };
};
export type NewReplay = {
	project_id: number;
	source_id: number;
	idempotency_key: string;
	method: string;
	path: string;
	query: string;
	source_ip: string | null;
	verified: boolean;
	headers: Prisma.InputJsonValue;
	body: Buffer;
	content_type: string | null;
	connections: { id: number; destination_id: number }[];
};

export interface EventRepository {
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개. 그 project의 것만 준다
	list(projectId: number, filter: EventFilter, cursor: bigint | null, take: number): Promise<EventRow[]>;
	find(projectId: number, id: bigint): Promise<EventDetail | null>;
	findBody(projectId: number, id: bigint): Promise<{ body: Buffer; content_type: string | null } | null>;
	findForReplay(projectId: number, id: bigint): Promise<ReplaySource | null>;
	// 새 event와 연결마다 delivery(pending)를 한 트랜잭션으로 넣는다
	storeReplay(replay: NewReplay): Promise<{ event: EventRow; delivery_ids: bigint[] }>;
}

export const EVENT_REPOSITORY = Symbol('EventRepository');
