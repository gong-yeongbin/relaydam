import type { MemberRole } from '@prisma/client';

const RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

// owner ⊃ admin ⊃ member. 요구 role이 여럿이면 그중 가장 낮은 것 이상이면 통과한다.
export function satisfiesRole(actual: MemberRole, required: MemberRole[]): boolean {
	return required.some((role) => RANK[actual] >= RANK[role]);
}
