import { exceedsMemberLimit, MEMBER_LIMIT, PROJECT_LIMIT } from './plan-limits';

describe('plan-limits', () => {
	it('멤버 상한 — free·personal 1명, team 10명, team_plus 무제한', () => {
		expect(MEMBER_LIMIT).toEqual({ free: 1, personal: 1, team: 10, team_plus: Infinity });
	});

	it('project 상한 — free 1, personal 3, team 10, team_plus 30', () => {
		expect(PROJECT_LIMIT).toEqual({ free: 1, personal: 3, team: 10, team_plus: 30 });
	});

	it('exceedsMemberLimit — 상한을 넘을 때만 true', () => {
		expect(exceedsMemberLimit('free', 1)).toBe(false);
		expect(exceedsMemberLimit('free', 2)).toBe(true);
		expect(exceedsMemberLimit('team', 10)).toBe(false);
		expect(exceedsMemberLimit('team', 11)).toBe(true);
		expect(exceedsMemberLimit('team_plus', 10_000)).toBe(false);
	});
});
