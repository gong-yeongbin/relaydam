import type { connection } from '@prisma/client';

export type ConnectionFilter = { source_id?: number; destination_id?: number };

// connection에는 project_id가 없다. 모든 조회·변경은 source가 그 project의 것인지로 범위를 건다.
// project가 그 조직의 것인지는 가드가 본다
export interface ConnectionRepository {
	// source·destination이 둘 다 그 project의 것이어야 만든다. 없거나 다른 project면 어느 쪽인지 돌려준다.
	// 이미 이어져 있으면 'conflict'
	create(projectId: number, sourceId: number, destinationId: number): Promise<connection | 'source_not_found' | 'destination_not_found' | 'conflict'>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(projectId: number, filter: ConnectionFilter, cursor: number | null, take: number): Promise<connection[]>;
	find(projectId: number, id: number): Promise<connection | null>;
	// 지웠으면 true
	remove(projectId: number, id: number): Promise<boolean>;
}

export const CONNECTION_REPOSITORY = Symbol('ConnectionRepository');
