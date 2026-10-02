import type { rejected_request, RejectionReason } from '@prisma/client';

export type RejectedRequestFilter = { source_id?: number; reason?: RejectionReason };

// 기록을 남기는 쪽은 인그레스다(modules/ingress). 여기는 읽기만 한다
export interface RejectedRequestRepository {
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개. 그 project의 것만 준다
	list(projectId: number, filter: RejectedRequestFilter, cursor: bigint | null, take: number): Promise<rejected_request[]>;
}

export const REJECTED_REQUEST_REPOSITORY = Symbol('RejectedRequestRepository');
