import type { delivery, delivery_attempt, DeliveryStatus } from '@prisma/client';

// 대시보드·관리 API가 보는 delivery. 워커가 쓰는 port(delivery.repository.ts)와 다르다
export type DeliveryDetail = delivery & { attempts: delivery_attempt[] };
export type DeliveryFilter = { status?: DeliveryStatus; destination_id?: number; event_id?: bigint };
// 일괄 재시도 조건. status는 필수다(dead·failed·canceled 중 하나)
export type BulkRetryFilter = { status: 'dead' | 'failed' | 'canceled'; destination_id?: number; created_after?: Date; created_before?: Date };

export interface DeliveryApiRepository {
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개. 그 project의 것만 준다
	list(projectId: number, filter: DeliveryFilter, cursor: bigint | null, take: number): Promise<delivery[]>;
	find(projectId: number, id: bigint): Promise<DeliveryDetail | null>;
	// pending으로 되돌린다. 처리 중(pending)이면 'pending'. 없거나 타 project면 'not_found'
	markRetry(projectId: number, id: bigint): Promise<delivery | 'not_found' | 'pending'>;
	// 조건에 맞는 것을 limit개까지 pending으로 되돌리고 그 id를 준다
	markBulkRetry(projectId: number, filter: BulkRetryFilter, limit: number): Promise<bigint[]>;
	// 예정된 재시도를 멈춘다(pending·failed·held → canceled). 이미 끝났으면 'closed'
	cancel(projectId: number, id: bigint): Promise<delivery | 'not_found' | 'closed'>;
}

export const DELIVERY_API_REPOSITORY = Symbol('DeliveryApiRepository');
