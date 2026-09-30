import type { Plan } from '@prisma/client';

// 플랜별 값은 코드 상수다. 근거는 plan.md 결정 11.
export const MEMBER_LIMIT: Record<Plan, number> = { free: 1, personal: 1, team: 10, team_plus: Infinity };
export const PROJECT_LIMIT: Record<Plan, number> = { free: 1, personal: 3, team: 10, team_plus: 30 };

export function exceedsMemberLimit(plan: Plan, memberCount: number): boolean {
	return memberCount > MEMBER_LIMIT[plan];
}
