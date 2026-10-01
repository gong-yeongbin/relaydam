import { exceedsMemberLimit, MEMBER_LIMIT, PROJECT_LIMIT } from './plan-limits';

describe('plan-limits', () => {
	it('멤버 상한 — free 1명, 유료 무제한', () => {
		expect(MEMBER_LIMIT).toEqual({ free: 1, team: Infinity, business: Infinity });
	});

	it('project 상한 — free 1, 유료 무제한', () => {
		expect(PROJECT_LIMIT).toEqual({ free: 1, team: Infinity, business: Infinity });
	});

	it('exceedsMemberLimit — 상한을 넘을 때만 true', () => {
		expect(exceedsMemberLimit('free', 1)).toBe(false);
		expect(exceedsMemberLimit('free', 2)).toBe(true);
		for (const plan of ['team', 'business'] as const) expect(exceedsMemberLimit(plan, 10_000)).toBe(false);
	});
});
