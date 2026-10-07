import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { RETENTION_DAYS } from '@/common/plan-limits';
import { RETENTION_REPOSITORY, type RetentionRepository } from './ports/retention.repository';

// 매시간 돈다. 지울 게 없으면 아무 일도 없으므로 하루 한 번과 결과가 같고, 하루치가 한 번에 몰리지 않는다
const INTERVAL_MS = 60 * 60 * 1_000;
// 한 문장에 지우는 수. 없을 때까지 반복한다
export const BATCH = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const PLANS = Object.keys(RETENTION_DAYS) as Plan[];

// 워커 프로세스에서만 돈다. 플랜별 보존일이 지난 event(delivery·attempt 포함)와 거부 기록을 지운다
@Injectable()
export class RetentionRunner implements OnApplicationBootstrap, OnModuleDestroy {
	private readonly logger = new Logger(RetentionRunner.name);
	private timer: NodeJS.Timeout | undefined;
	private busy = false;

	constructor(@Inject(RETENTION_REPOSITORY) private readonly retention: RetentionRepository) {}

	onApplicationBootstrap(): void {
		this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
		void this.tick();
	}

	onModuleDestroy(): void {
		clearInterval(this.timer);
	}

	// 플랜마다 지운 수를 준다
	async run(now: Date): Promise<Record<Plan, number>> {
		const deleted = {} as Record<Plan, number>;
		for (const plan of PLANS) {
			const cutoff = new Date(now.getTime() - RETENTION_DAYS[plan] * DAY_MS);
			deleted[plan] = (await this.drain((limit) => this.retention.deleteExpiredEvents(plan, cutoff, limit))) + (await this.drain((limit) => this.retention.deleteExpiredRejections(plan, cutoff, limit)));
		}
		return deleted;
	}

	// 앞 실행이 끝나지 않았으면 건너뛴다. 던져도 프로세스가 죽지 않게 로그만 남긴다
	private async tick(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			const deleted = await this.run(new Date());
			const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
			if (total > 0) this.logger.log(`보존일이 지난 기록 ${total}건 삭제`);
		} catch (error) {
			this.logger.error(`보존 배치 실패: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.busy = false;
		}
	}

	private async drain(deleteBatch: (limit: number) => Promise<number>): Promise<number> {
		let total = 0;
		let deleted: number;
		do {
			deleted = await deleteBatch(BATCH);
			total += deleted;
		} while (deleted === BATCH);
		return total;
	}
}
