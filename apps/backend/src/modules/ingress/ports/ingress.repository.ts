import type { Plan, Prisma, RejectionReason } from '@prisma/client';
import type { SignatureConfig } from '@/modules/sources/domain/signature-config';

// 수신 판단에 필요한 것을 한 번에 읽은 결과. 시크릿은 복호화한 원문이다
export type IngressSource = {
	id: number;
	project_id: number;
	organization_id: number;
	plan: Plan;
	// 결제 실패로 정지된 project인가
	suspended: boolean;
	signing_secret: string | null;
	signature_config: SignatureConfig | null;
	// 연결된 목적지. 비어 있으면 받지 않는다
	destination_ids: number[];
};

export type NewEvent = {
	project_id: number;
	source_id: number;
	idempotency_key: string;
	headers: Prisma.InputJsonObject;
	body: Buffer;
	content_type: string | null;
	destination_ids: number[];
};

export type StoredEvent = { event_id: bigint; delivery_ids: bigint[]; duplicate: boolean };

export type Rejection = { project_id: number; source_id: number; reason: RejectionReason; headers: Prisma.InputJsonObject; size: number };

export interface IngressRepository {
	findSourceBySlug(slug: string): Promise<IngressSource | null>;
	// event 한 줄과 목적지마다 delivery(pending) 한 줄을 한 트랜잭션으로 넣는다.
	// 같은 source에 같은 멱등 키가 이미 있으면 넣지 않고 기존 event의 id와 duplicate: true를 준다
	storeEvent(event: NewEvent): Promise<StoredEvent>;
	recordRejection(rejection: Rejection): Promise<void>;
}

export const INGRESS_REPOSITORY = Symbol('IngressRepository');
