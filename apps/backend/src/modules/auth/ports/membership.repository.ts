import type { MemberRole } from '@prisma/client';

export interface MembershipRepository {
	// 소속이 아니면 null
	findRole(organizationId: number, userId: number): Promise<MemberRole | null>;
}

export const MEMBERSHIP_REPOSITORY = Symbol('MembershipRepository');
