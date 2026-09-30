import type { MemberRole, organization_member, user } from '@prisma/client';

export type MemberWithUser = organization_member & { user: Pick<user, 'id' | 'email' | 'name' | 'avatar_url'> };

export interface MemberRepository {
	// user_id 내림차순. cursor가 있으면 그보다 작은 user_id부터 take개
	list(orgId: number, cursor: number | null, take: number): Promise<MemberWithUser[]>;
	// 없으면 null
	find(orgId: number, userId: number): Promise<organization_member | null>;
	updateRole(orgId: number, userId: number, role: MemberRole): Promise<MemberWithUser>;
	remove(orgId: number, userId: number): Promise<void>;
}

export const MEMBER_REPOSITORY = Symbol('MemberRepository');
