import { ConflictException, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import type { event } from '@prisma/client';
import type { DeliveryQueue, QueuedDelivery } from '@/modules/deliveries/ports/delivery.queue';
import type { IngressCounters } from '@/modules/ingress/ports/ingress.counters';
import { EventService } from './event.service';
import type { EventRepository, NewReplay, ReplaySource } from './ports/event.repository';

const PROJECT = 10;
const NOW = new Date('2026-10-07T03:00:00Z');
const BODY = Buffer.from('{"order":1}');

const row = {
	id: 120n,
	project_id: PROJECT,
	source_id: 7,
	idempotency_key: 'id:abc',
	method: 'PUT',
	path: '/orders/7',
	query: 'x=1',
	source_ip: '203.0.113.7',
	verified: true,
	headers: { 'content-type': 'application/json' },
	content_type: 'application/json',
	size: BODY.length,
	received_at: new Date('2026-10-01T00:00:00Z'),
};
const original: event = { ...row, body: new Uint8Array(BODY) };

// port를 in-memory fake로 둔다
class FakeEvents implements EventRepository {
	rows = [row, { ...row, id: 119n, source_id: null }];
	replay: ReplaySource | null = { event: original, source: { id: 7, connections: [{ id: 1, destination_id: 3 }] }, project: { organization_id: 1, plan: 'team', suspended: false } };
	stored: NewReplay | null = null;

	list(projectId: number, filter: { source_id?: number }, cursor: bigint | null, take: number) {
		return Promise.resolve(this.rows.filter((e) => e.project_id === projectId && (filter.source_id === undefined || e.source_id === filter.source_id) && (cursor === null || e.id < cursor)).slice(0, take));
	}
	find(projectId: number, id: bigint) {
		const found = this.rows.find((e) => e.project_id === projectId && e.id === id);
		return Promise.resolve(found ? { ...found, deliveries: [] } : null);
	}
	findBody(projectId: number, id: bigint) {
		return Promise.resolve(projectId === PROJECT && id === 120n ? { body: BODY, content_type: 'application/json' } : null);
	}
	findForReplay() {
		return Promise.resolve(this.replay);
	}
	storeReplay(replay: NewReplay) {
		this.stored = replay;
		return Promise.resolve({ event: { ...row, id: 121n, idempotency_key: replay.idempotency_key, size: replay.body.length, received_at: NOW }, delivery_ids: replay.connections.map((c) => BigInt(c.id)) });
	}
}

class FakeCounters implements Pick<IngressCounters, 'incrementUsage'> {
	used = 0;
	calls: [number, string][] = [];
	incrementUsage(organizationId: number, period: string) {
		this.calls.push([organizationId, period]);
		return Promise.resolve(++this.used);
	}
}

class FakeQueue implements Pick<DeliveryQueue, 'enqueue'> {
	enqueued: QueuedDelivery[] = [];
	fail = false;
	enqueue(items: QueuedDelivery[]) {
		if (this.fail) return Promise.reject(new Error('valkey down'));
		this.enqueued.push(...items);
		return Promise.resolve();
	}
}

describe('EventService', () => {
	let events: FakeEvents;
	let counters: FakeCounters;
	let queue: FakeQueue;
	let service: EventService;

	beforeEach(() => {
		events = new FakeEvents();
		counters = new FakeCounters();
		queue = new FakeQueue();
		service = new EventService(events, counters as unknown as IngressCounters, queue as unknown as DeliveryQueue);
	});

	it('list — 필터·커서를 넘기고 limit + 1로 다음 페이지를 판단한다', async () => {
		expect(await service.list(PROJECT, { limit: 1 })).toEqual({ data: [row], next_cursor: '120' });
		expect(await service.list(PROJECT, { limit: 1, cursor: 120 })).toEqual({ data: [{ ...row, id: 119n, source_id: null }], next_cursor: null });
		expect(await service.list(PROJECT, { limit: 50, source_id: 7 })).toEqual({ data: [row], next_cursor: null });
	});

	it('get·body — 없거나 타 project면 404', async () => {
		expect(await service.get(PROJECT, 120n)).toEqual({ ...row, deliveries: [] });
		expect(await service.body(PROJECT, 120n)).toEqual({ body: BODY, content_type: 'application/json' });
		await expect(service.get(PROJECT + 1, 120n)).rejects.toThrow(NotFoundException);
		await expect(service.body(PROJECT, 999n)).rejects.toThrow(NotFoundException);
	});

	describe('replay', () => {
		it('원본의 방식·경로·쿼리·헤더·본문·IP·verified로 새 event를 만들고, 지금 연결마다 delivery를 initial 사유로 큐에 넣는다. 사용량 +1', async () => {
			const replayed = await service.replay(PROJECT, 120n, NOW);

			expect(events.stored).toMatchObject({ project_id: PROJECT, source_id: 7, method: 'PUT', path: '/orders/7', query: 'x=1', source_ip: '203.0.113.7', verified: true, headers: { 'content-type': 'application/json' }, content_type: 'application/json', connections: [{ id: 1, destination_id: 3 }] });
			expect(events.stored!.body.equals(BODY)).toBe(true);
			expect(events.stored!.idempotency_key).toBe(`replay:120:${NOW.getTime()}`);
			expect(replayed).toMatchObject({ id: 121n, project_id: PROJECT });
			expect(replayed).not.toHaveProperty('body');
			expect(counters.calls).toEqual([[1, '202610']]);
			expect(queue.enqueued).toEqual([{ delivery_id: 1n, trigger: 'initial' }]);
		});

		it('없으면 404, 정지된 project는 403, 소스가 지워졌으면 409, 연결이 없으면 409. 사용량을 올리지 않는다', async () => {
			events.replay = null;
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toThrow(NotFoundException);

			events.replay = { event: original, source: { id: 7, connections: [] }, project: { organization_id: 1, plan: 'team', suspended: true } };
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toThrow(ForbiddenException);

			events.replay.project.suspended = false;
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toMatchObject({ response: { code: 'no_connection' } });

			events.replay.source = null;
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toThrow(ConflictException);
			expect(counters.calls).toEqual([]);
			expect(events.stored).toBeNull();
		});

		it('free 조직이 월 상한을 넘었으면 429. 사용량은 저장 전에 올리므로 올라간 채다', async () => {
			events.replay!.project.plan = 'free';
			counters.used = 1000;
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toMatchObject({ response: { code: 'usage_exceeded' }, status: 429 });
			await expect(service.replay(PROJECT, 120n, NOW)).rejects.toThrow(HttpException);
			expect(events.stored).toBeNull();

			counters.used = 998;
			await expect(service.replay(PROJECT, 120n, NOW)).resolves.toMatchObject({ id: 121n });
		});

		it('큐 적재가 실패해도 만든 것으로 답한다(sweeper가 다시 넣는다)', async () => {
			const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
			queue.fail = true;
			await expect(service.replay(PROJECT, 120n, NOW)).resolves.toMatchObject({ id: 121n });
			expect(logged).toHaveBeenCalledWith(expect.stringContaining('valkey down'));
			logged.mockRestore();
		});
	});
});
