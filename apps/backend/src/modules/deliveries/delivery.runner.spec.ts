import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import { DeliveryRunner, MAX_DELIVERIES } from './delivery.runner';
import type { DeliveryWorker } from './delivery.worker';
import type { DeliveryQueue, QueuedDelivery, ReceivedDelivery } from './ports/delivery.queue';
import type { DeliveryRepository } from './ports/delivery.repository';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// port를 in-memory fake로 둔다. read는 넣어 둔 묶음을 하나씩 주고, 없으면 blockMs를 기다렸다 빈 배열을 준다
class FakeQueue implements DeliveryQueue {
	batches: ReceivedDelivery[][] = [];
	due: bigint[] = [];
	reclaimable: ReceivedDelivery[] = [];
	enqueued: QueuedDelivery[] = [];
	acked: string[] = [];
	calls = { ensureGroup: 0, read: 0, takeDue: 0, reclaim: 0 };
	readError: Error | null = null;
	takeDueError: Error | null = null;
	// 스케줄러가 끝나지 않는 상황
	takeDueHangs = false;

	ensureGroup() {
		this.calls.ensureGroup++;
		return Promise.resolve();
	}
	async read(_consumer: string, _count: number, blockMs: number) {
		this.calls.read++;
		if (this.readError) throw this.readError;
		const batch = this.batches.shift();
		if (batch) return batch;
		await sleep(blockMs);
		return [];
	}
	reclaim() {
		this.calls.reclaim++;
		const items = this.reclaimable;
		this.reclaimable = [];
		return Promise.resolve(items);
	}
	takeDue() {
		this.calls.takeDue++;
		if (this.takeDueHangs) return new Promise<bigint[]>(() => undefined);
		if (this.takeDueError) return Promise.reject(this.takeDueError);
		const due = this.due;
		this.due = [];
		return Promise.resolve(due);
	}
	enqueue(items: QueuedDelivery[]) {
		this.enqueued.push(...items);
		return Promise.resolve();
	}
	ack(ids: string[]) {
		this.acked.push(...ids);
		return Promise.resolve();
	}
	schedule() {
		return Promise.resolve();
	}
	unschedule() {
		return Promise.resolve();
	}
}

const message = (id: bigint, times_delivered = 1): ReceivedDelivery => ({ message_id: `m-${id}`, delivery_id: id, times_delivered });

describe('DeliveryRunner', () => {
	let queue: FakeQueue;
	let processed: bigint[];
	let processError: Error | null;
	let stale: bigint[];
	let closed: { id: bigint; status: string; error?: string }[];
	let runner: DeliveryRunner;
	let logged: MockInstance;

	beforeEach(() => {
		vi.useFakeTimers();
		queue = new FakeQueue();
		processed = [];
		processError = null;
		stale = [];
		closed = [];
		const worker = {
			process: (item: QueuedDelivery) => {
				if (processError) return Promise.reject(processError);
				processed.push(item.delivery_id);
				return Promise.resolve('succeeded');
			},
		};
		const repository = {
			findStale: () => Promise.resolve(stale),
			close: (id: bigint, status: string, error?: string) => Promise.resolve(void closed.push({ id, status, error })),
		};
		runner = new DeliveryRunner(worker as unknown as DeliveryWorker, queue, repository as unknown as DeliveryRepository);
		logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
	});

	afterEach(async () => {
		const stopping = runner.onModuleDestroy();
		await vi.advanceTimersByTimeAsync(3_000);
		await stopping;
		vi.useRealTimers();
		logged.mockRestore();
	});

	describe('항목 처리', () => {
		it('읽은 묶음을 워커에 넘기고, 끝난 것만 큐에서 지운다', async () => {
			queue.batches = [[message(1n), message(2n)]];
			expect(await runner.consumeOnce(50)).toBe(2);

			expect(processed).toEqual([1n, 2n]);
			expect(queue.acked.sort()).toEqual(['m-1', 'm-2']);
		});

		it('처리하다 던지면 지우지 않고 오류를 남긴다. 다른 항목은 계속 처리한다', async () => {
			processError = new Error('db down');
			queue.batches = [[message(1n)]];
			await runner.consumeOnce(50);

			expect(queue.acked).toEqual([]);
			expect(logged).toHaveBeenCalledWith(expect.stringContaining('delivery 1 처리 실패: db down'));
		});

		it(`건네진 횟수가 ${MAX_DELIVERIES}를 넘으면 처리하지 않고 dead로 닫은 뒤 지운다`, async () => {
			queue.batches = [[message(1n, MAX_DELIVERIES), message(2n, MAX_DELIVERIES + 1)]];
			await runner.consumeOnce(50);

			expect(processed).toEqual([1n]);
			expect(closed).toEqual([{ id: 2n, status: 'dead', error: 'worker_failed' }]);
			expect(queue.acked.sort()).toEqual(['m-1', 'm-2']);
		});
	});

	describe('주기 작업', () => {
		it('스케줄러 — 시각이 된 예약을 자동 재시도 사유로 큐에 넣는다. 없으면 넣지 않는다', async () => {
			queue.due = [5n, 6n];
			expect(await runner.runScheduler(new Date())).toBe(2);
			expect(queue.enqueued).toEqual([
				{ delivery_id: 5n, trigger: 'automatic' },
				{ delivery_id: 6n, trigger: 'automatic' },
			]);

			expect(await runner.runScheduler(new Date())).toBe(0);
			expect(queue.enqueued).toHaveLength(2);
		});

		it('sweeper — 큐에 없는 오래된 delivery를 사유 없이 다시 넣는다(워커가 사유를 정한다)', async () => {
			stale = [7n];
			expect(await runner.runSweeper(new Date())).toBe(1);
			expect(queue.enqueued).toEqual([{ delivery_id: 7n }]);

			stale = [];
			expect(await runner.runSweeper(new Date())).toBe(0);
		});

		it('reclaim — 끝내지 못한 항목을 넘겨받아 처리한다', async () => {
			queue.reclaimable = [message(8n, 2)];
			expect(await runner.runReclaim()).toBe(1);
			expect(processed).toEqual([8n]);
			expect(queue.acked).toEqual(['m-8']);
		});
	});

	describe('켜고 끄기', () => {
		it('시작하면 그룹을 만들고 큐를 계속 읽는다. 5초·30초·60초마다 주기 작업을 돌린다', async () => {
			queue.batches = [[message(1n)]];
			await runner.onApplicationBootstrap();
			expect(queue.calls.ensureGroup).toBe(1);

			await vi.advanceTimersByTimeAsync(100);
			expect(processed).toEqual([1n]);

			await vi.advanceTimersByTimeAsync(5_000);
			expect(queue.calls.takeDue).toBe(1);
			expect(queue.calls.read).toBeGreaterThan(2);

			stale = [9n];
			await vi.advanceTimersByTimeAsync(55_000);
			expect(queue.calls.takeDue).toBe(12);
			expect(queue.calls.reclaim).toBe(2);
			expect(queue.enqueued).toContainEqual({ delivery_id: 9n });
		});

		it('종료하면 읽기를 멈추고 주기 작업도 돌지 않는다', async () => {
			await runner.onApplicationBootstrap();
			await vi.advanceTimersByTimeAsync(5_000);

			const stopping = runner.onModuleDestroy();
			await vi.advanceTimersByTimeAsync(3_000);
			await stopping;
			const { read, takeDue } = queue.calls;

			await vi.advanceTimersByTimeAsync(60_000);
			expect(queue.calls).toMatchObject({ read, takeDue });
		});

		it('큐 읽기가 실패하면 오류를 남기고 1초 뒤 다시 읽는다', async () => {
			queue.readError = new Error('valkey down');
			await runner.onApplicationBootstrap();
			await vi.advanceTimersByTimeAsync(100);
			expect(logged).toHaveBeenCalledWith(expect.stringContaining('큐 읽기 실패: valkey down'));
			expect(queue.calls.read).toBe(1);

			queue.readError = null;
			queue.batches = [[message(3n)]];
			await vi.advanceTimersByTimeAsync(1_000);
			expect(processed).toEqual([3n]);
		});

		it('종료 중에 연결이 먼저 끊겨 읽기가 실패해도 오류를 남기지 않고 끝난다', async () => {
			await runner.onApplicationBootstrap();
			await vi.advanceTimersByTimeAsync(100);

			queue.readError = new Error('Connection is closed.');
			const stopping = runner.onModuleDestroy();
			await vi.advanceTimersByTimeAsync(3_000);
			await stopping;
			expect(logged).not.toHaveBeenCalledWith(expect.stringContaining('큐 읽기 실패'));
		});

		it('주기 작업이 던져도 죽지 않고 오류만 남긴다. 다음 주기에 다시 돈다', async () => {
			queue.takeDueError = new Error('boom');
			await runner.onApplicationBootstrap();
			await vi.advanceTimersByTimeAsync(5_000);
			expect(logged).toHaveBeenCalledWith(expect.stringContaining('주기 작업 실패: boom'));

			queue.takeDueError = null;
			await vi.advanceTimersByTimeAsync(5_000);
			expect(queue.calls.takeDue).toBe(2);
		});

		it('앞 실행이 끝나지 않았으면 그 주기는 건너뛴다', async () => {
			queue.takeDueHangs = true;
			await runner.onApplicationBootstrap();
			await vi.advanceTimersByTimeAsync(20_000);
			expect(queue.calls.takeDue).toBe(1);
		});
	});
});
