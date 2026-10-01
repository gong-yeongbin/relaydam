import type { destination, Plan } from '@prisma/client';
import type { DestinationHeaders } from '../domain/headers';

// headers는 복호화한 원문이다. 응답으로 낼 때는 service가 가린다. 암호문 컬럼은 밖으로 내지 않는다
export type DestinationRecord = Omit<destination, 'headers_enc'> & { headers: DestinationHeaders };

export type DestinationWrite = { name: string; url: string; headers: DestinationHeaders; timeout_ms?: number; max_attempts?: number; concurrency?: number };

// 조직 행을 잠근 채 읽은 상태. check가 던지면 만들지 않는다
export type CreateCheck = (state: { plan: Plan; count: number }) => void;

// 모든 조회·변경은 projectId 조건을 건다. id만으로 찾지 않는다. project가 그 조직의 것인지는 가드가 본다
export interface DestinationRepository {
	// project가 속한 조직 행을 잠근 트랜잭션에서 plan·그 project의 destination 수를 읽어 check를 부르고, 통과하면 만든다
	create(projectId: number, data: DestinationWrite, check: CreateCheck): Promise<DestinationRecord>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(projectId: number, cursor: number | null, take: number): Promise<DestinationRecord[]>;
	find(projectId: number, id: number): Promise<DestinationRecord | null>;
	// 그 project의 destination이 아니면 null. undefined인 필드는 바꾸지 않는다. headers는 통째로 바꾼다
	update(projectId: number, id: number, data: Partial<DestinationWrite>): Promise<DestinationRecord | null>;
	// 지웠으면 true
	remove(projectId: number, id: number): Promise<boolean>;
}

export const DESTINATION_REPOSITORY = Symbol('DestinationRepository');
