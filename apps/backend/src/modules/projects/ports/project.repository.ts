import type { Plan, project } from '@prisma/client';

// 응답으로 나가는 모양. 암호화된 서명 키는 애초에 읽지 않는다
export type ProjectView = Omit<project, 'signing_secret_enc'>;

// 조직 행을 잠근 채 읽은 상태. check가 던지면 만들지 않는다
export type CreateCheck = (state: { plan: Plan; count: number }) => void;

// 모든 조회·변경은 orgId 조건을 건다. id만으로 찾지 않는다
export interface ProjectRepository {
	// 조직 행을 잠근 트랜잭션에서 plan·project 수(정지 포함)를 읽어 check를 부르고, 통과하면 만든다.
	// 같은 조직의 동시 생성이 상한을 넘지 않게 한다. 이름이 겹치면(대소문자 무시) 'name_conflict'.
	// signing_secret은 평문으로 넘기고 adapter가 암호화한다
	create(orgId: number, data: { name: string; signing_secret: string }, check: CreateCheck): Promise<ProjectView | 'name_conflict'>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(orgId: number, cursor: number | null, take: number): Promise<ProjectView[]>;
	find(orgId: number, id: number): Promise<ProjectView | null>;
	// 그 조직의 project가 아니면 null, 이름이 겹치면 'name_conflict'
	update(orgId: number, id: number, data: { name?: string }): Promise<ProjectView | null | 'name_conflict'>;
	// 지웠으면 true
	remove(orgId: number, id: number): Promise<boolean>;
	// 복호화한 서명 키. 그 조직의 project가 아니면 undefined, 아직 키가 없으면(예전 project) null
	findSigningSecret(orgId: number, id: number): Promise<string | null | undefined>;
	// 서명 키를 바꾼다. 바꿨으면 true
	setSigningSecret(orgId: number, id: number, secret: string): Promise<boolean>;
}

export const PROJECT_REPOSITORY = Symbol('ProjectRepository');
