import { baseDelayMs, MAX_RETRY_WINDOW_MS, nextAttemptAt, type RetryRule, retryAfterMs, willRetryAfterSec, withJitter } from './retry-schedule';

const MIN = 60_000;
const NOW = new Date('2026-10-02T03:00:00Z');
// 기본값: 2배씩·5분·9회
const DEFAULT: RetryRule = { retry_strategy: 'exponential', retry_interval_ms: 5 * MIN, retry_count: 9 };
// 흩뜨림 없음
const MID = 0.5;

describe('baseDelayMs', () => {
	it('exponential — Hookdeck 문서의 예: 10분·3회면 10분, 20분, 40분', () => {
		const rule: RetryRule = { retry_strategy: 'exponential', retry_interval_ms: 10 * MIN, retry_count: 3 };
		expect([1, 2, 3].map((n) => baseDelayMs(rule, n) / MIN)).toEqual([10, 20, 40]);
	});

	it('linear — 매번 같은 간격', () => {
		const rule: RetryRule = { retry_strategy: 'linear', retry_interval_ms: 10 * MIN, retry_count: 3 };
		expect([1, 2, 3].map((n) => baseDelayMs(rule, n) / MIN)).toEqual([10, 10, 10]);
	});

	it('기본값은 5분, 10분, … 21시간 20분이고 합치면 약 1.8일', () => {
		const delays = Array.from({ length: 9 }, (_, i) => baseDelayMs(DEFAULT, i + 1) / MIN);
		expect(delays).toEqual([5, 10, 20, 40, 80, 160, 320, 640, 1280]);
		expect(delays.reduce((a, b) => a + b) / 60 / 24).toBeCloseTo(1.77, 2);
	});
});

describe('withJitter', () => {
	it('±20% 안에서 흩뜨린다', () => {
		expect(withJitter(10 * MIN, 0)).toBe(8 * MIN);
		expect(withJitter(10 * MIN, MID)).toBe(10 * MIN);
		expect(withJitter(10 * MIN, 0.999999)).toBeLessThanOrEqual(12 * MIN);
		expect(withJitter(10 * MIN, 0.999999)).toBeGreaterThan(11.9 * MIN);
	});
});

describe('retryAfterMs', () => {
	it('초(정수), HTTP 날짜, ISO 문자열을 읽는다', () => {
		expect(retryAfterMs('120', NOW)).toBe(120_000);
		expect(retryAfterMs(' 0 ', NOW)).toBe(0);
		expect(retryAfterMs('Fri, 02 Oct 2026 03:10:00 GMT', NOW)).toBe(10 * MIN);
		expect(retryAfterMs('2026-10-02T03:30:00Z', NOW)).toBe(30 * MIN);
	});

	it('이미 지난 시각이면 0, 없거나 읽을 수 없으면 null', () => {
		expect(retryAfterMs('2026-10-02T02:00:00Z', NOW)).toBe(0);
		expect(retryAfterMs(undefined, NOW)).toBeNull();
		expect(retryAfterMs('soon', NOW)).toBeNull();
		expect(retryAfterMs('-5', NOW)).toBeNull();
	});
});

describe('nextAttemptAt', () => {
	const next = (overrides: Partial<Parameters<typeof nextAttemptAt>[0]>) => nextAttemptAt({ rule: DEFAULT, retriesDone: 0, firstAttemptAt: NOW, now: NOW, random: MID, ...overrides });

	it('설정대로 다음 시각을 준다. 첫 시도가 실패하면 5분 뒤, 그다음은 10분 뒤', () => {
		expect(next({})).toEqual(new Date(NOW.getTime() + 5 * MIN));
		expect(next({ retriesDone: 1 })).toEqual(new Date(NOW.getTime() + 10 * MIN));
		expect(next({ retriesDone: 8 })).toEqual(new Date(NOW.getTime() + 1280 * MIN));
	});

	it('흩뜨림이 들어간다', () => {
		expect(next({ random: 0 })).toEqual(new Date(NOW.getTime() + 4 * MIN));
	});

	it('재시도 횟수를 다 쓰면 null (dead)', () => {
		expect(next({ retriesDone: 9 })).toBeNull();
		expect(next({ rule: { ...DEFAULT, retry_count: 0 } })).toBeNull();
	});

	it('설정이 50을 넘어도 50회에서 멈춘다', () => {
		const rule: RetryRule = { retry_strategy: 'linear', retry_interval_ms: 1000, retry_count: 999 };
		expect(next({ rule, retriesDone: 49 })).not.toBeNull();
		expect(next({ rule, retriesDone: 50 })).toBeNull();
	});

	it('다음 시도가 첫 시도로부터 1주일을 넘으면 null (dead)', () => {
		const rule: RetryRule = { retry_strategy: 'linear', retry_interval_ms: 60 * MIN, retry_count: 50 };
		const firstAttemptAt = new Date(NOW.getTime() - MAX_RETRY_WINDOW_MS + 30 * MIN);
		expect(next({ rule, firstAttemptAt, retriesDone: 3 })).toBeNull();
		// 1주일 안에 들어오면 예약한다
		expect(next({ rule: { ...rule, retry_interval_ms: 10 * MIN }, firstAttemptAt, retriesDone: 3 })).not.toBeNull();
	});

	it('목적지가 Retry-After를 주면 설정보다 그 값을 쓴다. 흩뜨리지 않는다', () => {
		expect(next({ retryAfter: '30', random: 0 })).toEqual(new Date(NOW.getTime() + 30_000));
		// 읽을 수 없는 값이면 설정으로 돌아간다
		expect(next({ retryAfter: 'later' })).toEqual(new Date(NOW.getTime() + 5 * MIN));
		// Retry-After도 1주일과 횟수 상한을 넘지 못한다
		expect(next({ retryAfter: String(8 * 24 * 60 * 60) })).toBeNull();
		expect(next({ retryAfter: '30', retriesDone: 9 })).toBeNull();
	});
});

describe('willRetryAfterSec', () => {
	it('이번 시도가 실패하면 몇 초 뒤에 다시 보낼지. 흩뜨리기 전의 값이다', () => {
		expect(willRetryAfterSec(DEFAULT, 0)).toBe(300);
		expect(willRetryAfterSec(DEFAULT, 1)).toBe(600);
	});

	it('마지막 시도면 null', () => {
		expect(willRetryAfterSec(DEFAULT, 9)).toBeNull();
		expect(willRetryAfterSec({ ...DEFAULT, retry_count: 0 }, 0)).toBeNull();
	});
});
