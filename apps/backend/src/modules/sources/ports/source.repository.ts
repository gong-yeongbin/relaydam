import type { Plan, source } from '@prisma/client';
import type { SignatureConfig } from '../domain/signature-config';

// 응답으로 나가는 모양. 암호화된 시크릿은 애초에 읽지 않는다
export type SourceView = Omit<source, 'signing_secret_enc'>;

// 서명 검증 설정. 시크릿은 평문으로 넘기고 adapter가 암호화한다. 둘 다 null이면 검증 없이 받는다
export type Signature = { signing_secret: string | null; signature_config: SignatureConfig | null };

// 조직 행을 잠근 채 읽은 상태. check가 던지면 만들지 않는다
export type CreateCheck = (state: { plan: Plan; count: number }) => void;

// 모든 조회·변경은 projectId 조건을 건다. id만으로 찾지 않는다. project가 그 조직의 것인지는 가드가 본다
export interface SourceRepository {
	// project가 속한 조직 행을 잠근 트랜잭션에서 plan·그 project의 source 수를 읽어 check를 부르고, 통과하면 만든다
	create(projectId: number, data: { name: string; slug: string } & Signature, check: CreateCheck): Promise<SourceView>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(projectId: number, cursor: number | null, take: number): Promise<SourceView[]>;
	find(projectId: number, id: number): Promise<SourceView | null>;
	// 그 project의 source가 아니면 null. undefined인 필드는 바꾸지 않는다
	update(projectId: number, id: number, data: { name?: string; slug?: string } & Partial<Signature>): Promise<SourceView | null>;
	// 지웠으면 true
	remove(projectId: number, id: number): Promise<boolean>;
}

export const SOURCE_REPOSITORY = Symbol('SourceRepository');
