import { Injectable } from '@nestjs/common';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import type { IngressCounters } from '../ports/ingress.counters';

// 월 청구(4. billing)가 스냅샷으로 옮긴 뒤에는 필요 없다. 넉넉히 두고 스스로 사라지게 한다
const USAGE_TTL_SEC = 100 * 24 * 60 * 60;
// 거부 기록은 "왜 안 들어오는지" 확인용이라 최근 몇 건이면 된다. 누구나 만들 수 있는 행이라 상한을 둔다
export const REJECTION_RECORDS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;

export const usageKey = (organizationId: number, period: string) => `org:${organizationId}:usage:${period}`;
export const rejectionKey = (sourceId: number, now: Date) => `source:${sourceId}:rejected:${Math.floor(now.getTime() / MINUTE_MS)}`;

@Injectable()
export class ValkeyIngressCounters implements IngressCounters {
	constructor(private readonly valkey: ValkeyService) {}

	incrementUsage(organizationId: number, period: string): Promise<number> {
		return this.increment(usageKey(organizationId, period), USAGE_TTL_SEC);
	}

	async allowRejectionRecord(sourceId: number, now: Date): Promise<boolean> {
		return (await this.increment(rejectionKey(sourceId, now), 2 * 60)) <= REJECTION_RECORDS_PER_MINUTE;
	}

	// 만료는 키가 처음 생길 때 한 번만 건다. 평소 경로는 INCR 하나다
	private async increment(key: string, ttlSec: number): Promise<number> {
		const count = await this.valkey.incr(key);
		if (count === 1) await this.valkey.expire(key, ttlSec);
		return count;
	}
}
