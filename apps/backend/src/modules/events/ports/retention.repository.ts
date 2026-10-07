import type { Plan } from '@prisma/client';

// 플랜별 보존일이 지난 기록을 지운다. event를 지우면 delivery·attempt가 같이 지워진다(FK cascade)
export interface RetentionRepository {
	// 그 플랜 조직의 event 중 cutoff 전에 받은 것을 limit개까지 지우고 지운 수를 준다
	deleteExpiredEvents(plan: Plan, cutoff: Date, limit: number): Promise<number>;
	deleteExpiredRejections(plan: Plan, cutoff: Date, limit: number): Promise<number>;
}

export const RETENTION_REPOSITORY = Symbol('RetentionRepository');
