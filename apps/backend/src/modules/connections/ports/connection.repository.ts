import type { connection, RetryStrategy } from '@prisma/client';

export type ConnectionFilter = { source_id?: number; destination_id?: number };

// 재시도 설정. retry_count는 첫 시도를 뺀 재시도 수다
export type RetryRule = { retry_strategy: RetryStrategy; retry_interval_ms: number; retry_count: number };

// connection에는 project_id가 없다. 모든 조회·변경은 source가 그 project의 것인지로 범위를 건다.
// project가 그 조직의 것인지는 가드가 본다
export interface ConnectionRepository {
	// source·destination이 둘 다 그 project의 것이어야 만든다. 없거나 다른 project면 어느 쪽인지 돌려준다.
	// 이미 이어져 있으면 'conflict'. 재시도 설정에서 빠진 값은 DB 기본값(2배씩·5분·9회)이다
	create(
		projectId: number,
		sourceId: number,
		destinationId: number,
		retry: Partial<RetryRule>,
	): Promise<connection | 'source_not_found' | 'destination_not_found' | 'conflict'>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(projectId: number, filter: ConnectionFilter, cursor: number | null, take: number): Promise<connection[]>;
	find(projectId: number, id: number): Promise<connection | null>;
	// 그 project의 연결이 아니면 null. undefined인 필드는 바꾸지 않는다. paused_at에 null을 주면 일시 정지를 푼다
	update(projectId: number, id: number, data: Partial<RetryRule> & { paused_at?: Date | null }): Promise<connection | null>;
	// 지웠으면 true
	remove(projectId: number, id: number): Promise<boolean>;
}

export const CONNECTION_REPOSITORY = Symbol('ConnectionRepository');
