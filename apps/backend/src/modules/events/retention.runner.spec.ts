import { Logger } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import type { RetentionRepository } from './ports/retention.repository';
import { BATCH, RetentionRunner } from './retention.runner';

const NOW = new Date('2026-10-07T03:00:00Z');
const DAY = 24 * 60 * 60 * 1_000;

// 플랜마다 "지울 수 있는 수"를 들고 있다가 부를 때마다 limit만큼 내준다
class FakeRetention implements RetentionRepository {
	events: Record<Plan, number> = { free: 0, team: 0, business: 0 };
	rejections: Record<Plan, number> = { free: 0, team: 0, business: 0 };
	calls: [string, Plan, Date, number][] = [];
	fail = false;

	deleteExpiredEvents(plan: Plan, cutoff: Date, limit: number) {
		if (this.fail) return Promise.reject(new Error('db down'));
		this.calls.push(['event', plan, cutoff, limit]);
		const deleted = Math.min(this.events[plan], limit);
		this.events[plan] -= deleted;
		return Promise.resolve(deleted);
	}
	deleteExpiredRejections(plan: Plan, cutoff: Date, limit: number) {
		this.calls.push(['rejection', plan, cutoff, limit]);
		const deleted = Math.min(this.rejections[plan], limit);
		this.rejections[plan] -= deleted;
		return Promise.resolve(deleted);
	}
}

describe('RetentionRunner', () => {
	let retention: FakeRetention;
	let runner: RetentionRunner;

	beforeEach(() => {
		retention = new FakeRetention();
		runner = new RetentionRunner(retention);
	});
	afterEach(() => {
		runner.onModuleDestroy();
		vi.useRealTimers();
	});

	it('플랜별 보존일(free 3·team 7·business 30) 전의 것을 1,000건씩 없을 때까지 지운다', async () => {
		retention.events.team = 2_500;
		retention.rejections.free = 1_000;

		expect(await runner.run(NOW)).toEqual({ free: 1_000, team: 2_500, business: 0 });

		const cutoffs = Object.fromEntries(retention.calls.map(([, plan, cutoff]) => [plan, cutoff])) as Record<Plan, Date>;
		expect(cutoffs.free).toEqual(new Date(NOW.getTime() - 3 * DAY));
		expect(cutoffs.team).toEqual(new Date(NOW.getTime() - 7 * DAY));
		expect(cutoffs.business).toEqual(new Date(NOW.getTime() - 30 * DAY));
		// team event는 1,000·1,000·500으로 세 번, 거부 기록은 딱 1,000건이라 한 번 더 불러 0을 확인한다
		expect(retention.calls.filter(([kind, plan]) => kind === 'event' && plan === 'team')).toHaveLength(3);
		expect(retention.calls.filter(([kind, plan]) => kind === 'rejection' && plan === 'free')).toHaveLength(2);
		expect(retention.calls.every(([, , , limit]) => limit === BATCH)).toBe(true);
		expect(retention.events.team).toBe(0);
	});

	it('켜면 바로 한 번 돌고 매시간 다시 돈다. 앞 실행이 안 끝났으면 건너뛰고, 던져도 죽지 않는다', async () => {
		vi.useFakeTimers({ now: NOW });
		const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		retention.events.free = 1;

		runner.onApplicationBootstrap();
		await vi.advanceTimersByTimeAsync(0);
		expect(retention.calls.filter(([kind]) => kind === 'event')).toHaveLength(3);

		retention.fail = true;
		await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('db down'));
		logged.mockRestore();
	});
});
