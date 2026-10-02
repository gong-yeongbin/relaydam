import { usagePeriod } from './usage-period';

describe('usagePeriod', () => {
	it('한국 시각 기준의 yyyymm', () => {
		expect(usagePeriod(new Date('2026-10-15T03:00:00Z'))).toBe('202610');
		expect(usagePeriod(new Date('2026-01-05T00:00:00Z'))).toBe('202601');
	});

	it('한국 시각으로 1일 0시에 달이 바뀐다 (UTC로는 전날 15시)', () => {
		expect(usagePeriod(new Date('2026-10-31T14:59:59Z'))).toBe('202610');
		expect(usagePeriod(new Date('2026-10-31T15:00:00Z'))).toBe('202611');
	});

	it('해가 바뀐다', () => {
		expect(usagePeriod(new Date('2026-12-31T15:00:00Z'))).toBe('202701');
	});
});
