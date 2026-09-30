import type { MemberRole, Plan } from '@prisma/client';

export type OrgAccess = { role: MemberRole; plan: Plan; member_count: number };

export interface MembershipRepository {
	// 소속이 아니면 null. 멤버 수 상한 검사를 위해 조직 플랜과 멤버 수를 같이 준다
	findAccess(organizationId: number, userId: number): Promise<OrgAccess | null>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MembershipRepository');
