import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import { circuitState, openAfterFailure } from '../domain/circuit-state';
import type { CircuitCheck, DestinationGuard } from '../ports/destination.guard';

// 연속 실패 수가 하루 동안 더 쌓이지 않으면 지운다. 지워진 목적지의 키가 남지 않게 한다
const FAILURES_TTL_SEC = 24 * 60 * 60;
// half_open 프로브 자리를 잡아 두는 시간. 프로브 결과가 오면 그 전에 지워진다
const PROBE_TTL_MS = 60_000;

// 목적지별 키. 통합 테스트가 상태를 보거나 시간을 건너뛸 때(open 키 삭제) 쓴다
export const guardKeys = (destinationId: number) => ({
	// 잡힌 자리. 멤버가 자리 토큰, 점수가 만료 시각(ms)인 정렬 집합
	inflight: `dest:${destinationId}:inflight`,
	failures: `dest:${destinationId}:circuit:failures`,
	open: `dest:${destinationId}:circuit:open`,
	probe: `dest:${destinationId}:circuit:probe`,
});

// 만료된 자리를 치우고, 빈자리가 있으면 잡는다. 한 스크립트라 워커 여러 대가 동시에 와도 정원을 넘지 않는다.
// 키 자체도 가장 늦게 만료되는 자리에 맞춰 사라지게 해 쓰지 않는 목적지의 키가 남지 않는다.
// KEYS[1] inflight, ARGV: now, limit, expires_at, token
const ACQUIRE = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
local last = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')
redis.call('PEXPIREAT', KEYS[1], last[2])
return 1
`;

@Injectable()
export class ValkeyDestinationGuard implements DestinationGuard {
	constructor(private readonly valkey: ValkeyService) {}

	async acquire(destinationId: number, limit: number, holdMs: number): Promise<string | null> {
		const now = Date.now();
		const token = randomUUID();
		const taken = await this.valkey.eval(ACQUIRE, 1, guardKeys(destinationId).inflight, now, limit, now + holdMs, token);
		return taken === 1 ? token : null;
	}

	async release(destinationId: number, token: string): Promise<void> {
		await this.valkey.zrem(guardKeys(destinationId).inflight, token);
	}

	async circuit(destinationId: number): Promise<CircuitCheck> {
		const keys = guardKeys(destinationId);
		const [failures, openTtl] = await Promise.all([this.valkey.get(keys.failures), this.valkey.pttl(keys.open)]);
		// PTTL은 키가 없으면 -2, 만료가 없으면 -1을 준다. 둘 다 "열려 있지 않음"이다
		const state = circuitState({ failures: Number(failures ?? 0), open_remaining_ms: Math.max(0, openTtl) });
		if (state === 'open') return { state, remaining_ms: openTtl };
		if (state === 'closed') return { state };
		// 프로브 자리를 먼저 잡은 워커 하나만 보낸다
		const probe = (await this.valkey.set(keys.probe, '1', 'PX', PROBE_TTL_MS, 'NX')) === 'OK';
		return { state, probe };
	}

	async recordSuccess(destinationId: number): Promise<void> {
		const keys = guardKeys(destinationId);
		await this.valkey.del(keys.failures, keys.probe);
	}

	async recordFailure(destinationId: number): Promise<void> {
		const keys = guardKeys(destinationId);
		const [[, failures]] = (await this.valkey.multi().incr(keys.failures).expire(keys.failures, FAILURES_TTL_SEC).exec()) as [[null, number]];
		const openMs = openAfterFailure(failures);
		const pipeline = this.valkey.multi().del(keys.probe);
		if (openMs > 0) pipeline.set(keys.open, '1', 'PX', openMs);
		await pipeline.exec();
	}
}
