import { randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import { DELIVERY_STREAM, ValkeyDeliveryQueue } from './valkey-delivery.queue';
import { REJECTION_RECORDS_PER_MINUTE, rejectionKey, usageKey, ValkeyIngressCounters } from './valkey-ingress.counters';

// adapter는 docker compose의 valkey 위에서 통합으로 본다(`pnpm docker:up` 선행). 테스트는 DB 1번을 쓴다(test/setup.ts)
describe('Valkey 인그레스 adapter (통합)', () => {
	const valkey = new ValkeyService(new ConfigService({ REDIS_URL: process.env.REDIS_URL }));
	const counters = new ValkeyIngressCounters(valkey);
	const queue = new ValkeyDeliveryQueue(valkey);
	// 다른 실행과 키가 겹치지 않게 큰 난수 id를 쓴다
	const id = () => randomInt(1_000_000_000, 2_000_000_000);
	const created: string[] = [];

	beforeAll(() => valkey.onModuleInit());

	afterAll(async () => {
		if (created.length > 0) await valkey.del(...created);
		await valkey.onModuleDestroy();
	});

	describe('ValkeyIngressCounters', () => {
		it('incrementUsage — 조직·달마다 따로 세고 올린 뒤의 값을 준다. 키는 스스로 만료된다', async () => {
			const org = id();
			created.push(usageKey(org, '202610'), usageKey(org, '202611'));

			expect(await counters.incrementUsage(org, '202610')).toBe(1);
			expect(await counters.incrementUsage(org, '202610')).toBe(2);
			expect(await counters.incrementUsage(org, '202611')).toBe(1);

			const ttl = await valkey.ttl(usageKey(org, '202610'));
			expect(ttl).toBeGreaterThan(90 * 24 * 60 * 60);
			expect(ttl).toBeLessThanOrEqual(100 * 24 * 60 * 60);
		});

		it('incrementUsage — 동시에 올려도 빠지지 않는다', async () => {
			const org = id();
			created.push(usageKey(org, '202610'));

			const counts = await Promise.all(Array.from({ length: 50 }, () => counters.incrementUsage(org, '202610')));
			expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
		});

		it('allowRejectionRecord — 소스당 분당 10건까지 true, 그 뒤는 false. 다음 분과 다른 소스는 다시 true', async () => {
			const source = id();
			const other = id();
			const now = new Date('2026-10-02T03:00:10Z');
			const nextMinute = new Date('2026-10-02T03:01:00Z');
			created.push(rejectionKey(source, now), rejectionKey(source, nextMinute), rejectionKey(other, now));

			for (let i = 0; i < REJECTION_RECORDS_PER_MINUTE; i++) expect(await counters.allowRejectionRecord(source, now)).toBe(true);
			expect(await counters.allowRejectionRecord(source, now)).toBe(false);
			// 같은 분 안이면 초가 달라도 같은 칸이다
			expect(await counters.allowRejectionRecord(source, new Date('2026-10-02T03:00:59Z'))).toBe(false);

			expect(await counters.allowRejectionRecord(source, nextMinute)).toBe(true);
			expect(await counters.allowRejectionRecord(other, now)).toBe(true);
			expect(await valkey.ttl(rejectionKey(source, now))).toBeLessThanOrEqual(120);
		});
	});

	describe('ValkeyDeliveryQueue', () => {
		it('enqueue — delivery id마다 Stream에 항목 하나를 넣는다', async () => {
			const [a, b] = [BigInt(id()), BigInt(id())];
			await queue.enqueue([a, b]);

			// 다른 테스트 파일이 같은 Stream에 넣을 수 있어 넣은 id로 찾는다
			const entries = await valkey.xrevrange(DELIVERY_STREAM, '+', '-', 'COUNT', 200);
			const ids = entries.map(([, fields]) => fields).filter(([name]) => name === 'delivery_id').map(([, value]) => value);
			expect(ids).toEqual(expect.arrayContaining([a.toString(), b.toString()]));
			// 넣은 순서가 유지된다
			expect(ids.indexOf(b.toString())).toBeLessThan(ids.indexOf(a.toString()));
		});
	});
});
