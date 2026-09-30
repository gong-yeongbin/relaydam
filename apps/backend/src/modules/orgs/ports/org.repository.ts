import type { MemberRole, organization } from '@prisma/client';

export type OrgWithRole = organization & { role: MemberRole };

export interface OrgRepository {
	// userId가 속한 조직을 id 내림차순으로. cursor가 있으면 그보다 작은 id부터 take개
	listByMember(userId: number, cursor: number | null, take: number): Promise<OrgWithRole[]>;
	// 없으면 null
	findById(id: number): Promise<organization | null>;
	update(id: number, data: { name?: string }): Promise<organization>;
}

export const ORG_REPOSITORY = Symbol('OrgRepository');
