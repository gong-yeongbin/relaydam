import { ENDPOINT_LIMIT, exceedsMemberLimit, INCLUDED_EVENTS, MEMBER_LIMIT, PROJECT_LIMIT } from './plan-limits';

describe('plan-limits', () => {
	it('멤버 상한 — free 1명, 유료 무제한', () => {
		expect(MEMBER_LIMIT).toEqual({ free: 1, team: Infinity, business: Infinity });
	});

	it('project 상한 — free 1, 유료 무제한', () => {
		expect(PROJECT_LIMIT).toEqual({ free: 1, team: Infinity, business: Infinity });
	});

	it('월 포함 이벤트 — free 1,000, 유료 1만', () => {
		expect(INCLUDED_EVENTS).toEqual({ free: 1_000, team: 10_000, business: 10_000 });
	});

	it('source·destination 상한 — free는 project당 각 3개, 유료 무제한', () => {
		expect(ENDPOINT_LIMIT).toEqual({ free: 3, team: Infinity, business: Infinity });
	});

	it('exceedsMemberLimit — 상한을 넘을 때만 true', () => {
		expect(exceedsMemberLimit('free', 1)).toBe(false);
		expect(exceedsMemberLimit('free', 2)).toBe(true);
		for (const plan of ['team', 'business'] as const) expect(exceedsMemberLimit(plan, 10_000)).toBe(false);
	});
});
