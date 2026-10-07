import type { Plan } from '@prisma/client';

// 플랜별 값은 코드 상수다. 근거는 plan.md 결정 11.
export const MEMBER_LIMIT: Record<Plan, number> = { free: 1, team: Infinity, business: Infinity };
export const PROJECT_LIMIT: Record<Plan, number> = { free: 1, team: Infinity, business: Infinity };
// 조직의 월 포함 이벤트 수. free는 넘으면 인그레스가 429로 거부하고, 유료는 넘은 만큼 종량으로 청구한다(4. billing)
export const INCLUDED_EVENTS: Record<Plan, number> = { free: 1_000, team: 10_000, business: 10_000 };
// source·destination 각각, project당
export const ENDPOINT_LIMIT: Record<Plan, number> = { free: 3, team: Infinity, business: Infinity };
// 이벤트·전달 기록·거부 기록을 보관하는 날수(Hookdeck과 같다). 지나면 보존 배치가 지운다
export const RETENTION_DAYS: Record<Plan, number> = { free: 3, team: 7, business: 30 };

export function exceedsMemberLimit(plan: Plan, memberCount: number): boolean {
	return memberCount > MEMBER_LIMIT[plan];
}
