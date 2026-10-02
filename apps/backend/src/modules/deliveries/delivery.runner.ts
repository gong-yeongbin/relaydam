import { hostname } from 'node:os';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { DeliveryWorker } from './delivery.worker';
import { DELIVERY_QUEUE, type DeliveryQueue, type ReceivedDelivery } from './ports/delivery.queue';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from './ports/delivery.repository';

// 한 번에 읽는 수. 읽은 것은 동시에 처리한다
const BATCH = 10;
// 큐가 비었을 때 새 항목을 기다리는 시간. 종료할 때 이만큼은 기다릴 수 있다
const BLOCK_MS = 2_000;
// 재시도 시각이 된 것을 큐로 옮기는 주기
const SCHEDULER_MS = 5_000;
// 큐에 있어야 하는데 없는 것을 다시 넣는 주기와, "없다"고 보는 기준 시간
const SWEEPER_MS = 60_000;
const STALE_MS = 120_000;
// 읽어 가고 끝내지 못한 항목을 넘겨받는 주기와 기준 시간
const RECLAIM_MS = 30_000;
const RECLAIM_IDLE_MS = 60_000;
// 같은 항목이 이만큼 건네지고도 처리가 안 끝나면 그 delivery를 dead로 닫는다. 처리 중 계속 죽는 항목이 큐를 막지 않게 한다
export const MAX_DELIVERIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 워커 프로세스에서만 돈다(main.consumer.ts). 큐를 읽어 DeliveryWorker에 넘기고, 주기 작업 셋을 돌린다
@Injectable()
export class DeliveryRunner implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(DeliveryRunner.name);
	private readonly consumer = `${hostname()}-${process.pid}`;
	private running = false;
	private loop: Promise<void> = Promise.resolve();
	private timers: NodeJS.Timeout[] = [];

	constructor(
		private readonly worker: DeliveryWorker,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
		@Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
	) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.queue.ensureGroup();
		this.running = true;
		this.loop = this.consume();
		this.timers = [
			this.every(SCHEDULER_MS, () => this.runScheduler(new Date())),
			this.every(SWEEPER_MS, () => this.runSweeper(new Date())),
			this.every(RECLAIM_MS, () => this.runReclaim()),
		];
	}

	// 읽기를 멈추고 처리 중인 것이 끝나기를 기다린다
	async onModuleDestroy(): Promise<void> {
		this.running = false;
		for (const timer of this.timers) clearInterval(timer);
		await this.loop;
	}

	// 큐에서 한 묶음을 읽어 처리한다. 처리한 수를 준다
	async consumeOnce(blockMs = BLOCK_MS): Promise<number> {
		const messages = await this.queue.read(this.consumer, BATCH, blockMs);
		await Promise.all(messages.map((message) => this.handle(message)));
		return messages.length;
	}

	// 재시도 시각이 된 delivery를 큐로 옮긴다
	async runScheduler(now: Date): Promise<number> {
		const due = await this.queue.takeDue(now, 100);
		if (due.length > 0) await this.queue.enqueue(due.map((delivery_id) => ({ delivery_id, trigger: 'automatic' as const })));
		return due.length;
	}

	// 큐 적재가 빠졌거나 예약이 사라진 delivery를 다시 큐에 넣는다(인그레스는 저장이 끝나면 적재가 실패해도 200으로 답한다)
	async runSweeper(now: Date): Promise<number> {
		const stale = await this.deliveries.findStale(now, STALE_MS, 500);
		if (stale.length > 0) await this.queue.enqueue(stale.map((delivery_id) => ({ delivery_id })));
		return stale.length;
	}

	// 다른 워커가 읽어 가고 끝내지 못한 항목을 넘겨받아 처리한다
	async runReclaim(minIdleMs = RECLAIM_IDLE_MS): Promise<number> {
		const messages = await this.queue.reclaim(this.consumer, minIdleMs, BATCH);
		await Promise.all(messages.map((message) => this.handle(message)));
		return messages.length;
	}

	// 처리가 끝나야 큐에서 지운다. 처리하다 던지면 지우지 않고 두어 reclaim이 다시 가져오게 한다
	private async handle(message: ReceivedDelivery): Promise<void> {
		try {
			if (message.times_delivered > MAX_DELIVERIES) {
				await this.deliveries.close(message.delivery_id, 'dead', 'worker_failed');
			} else {
				await this.worker.process(message, new Date(), Math.random());
			}
			await this.queue.ack([message.message_id]);
		} catch (error) {
			this.logger.error(`delivery ${message.delivery_id} 처리 실패: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async consume(): Promise<void> {
		while (this.running) {
			try {
				await this.consumeOnce();
			} catch (error) {
				// 종료 중에 연결이 먼저 끊긴 경우다
				if (!this.running) break;
				this.logger.error(`큐 읽기 실패: ${error instanceof Error ? error.message : String(error)}`);
				await sleep(1_000);
			}
		}
	}

	// 앞 실행이 끝나지 않았으면 건너뛴다. 던져도 프로세스가 죽지 않게 로그만 남긴다
	private every(ms: number, job: () => Promise<unknown>): NodeJS.Timeout {
		let busy = false;
		return setInterval(() => {
			if (busy) return;
			busy = true;
			job()
				.catch((error: unknown) => this.logger.error(`주기 작업 실패: ${error instanceof Error ? error.message : String(error)}`))
				.finally(() => {
					busy = false;
				});
		}, ms);
	}
}
