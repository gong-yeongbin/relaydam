import { ConflictException, NotFoundException } from '@nestjs/common';
import type { connection } from '@prisma/client';
import { ConnectionService } from './connection.service';
import type { ConnectionFilter, ConnectionRepository, RetryRule } from './ports/connection.repository';
import type { HeldDeliveries } from './ports/held-deliveries';

const PROJECT = 10;
const NOW = new Date('2026-10-02T03:00:00Z');

// port를 in-memory fake로 둔다. 소스·목적지는 "어느 project의 것인가"만 들고 있는다
class FakeConnections implements ConnectionRepository {
	sources = new Map<number, number>([
		[1, PROJECT],
		[2, PROJECT],
		[9, PROJECT + 1],
	]);
	destinations = new Map<number, number>([
		[1, PROJECT],
		[2, PROJECT],
		[9, PROJECT + 1],
	]);
	rows: connection[] = [];
	nextId = 1;

	private inProject(projectId: number, row: connection) {
		return this.sources.get(row.source_id) === projectId;
	}
	create(projectId: number, sourceId: number, destinationId: number, retry: Partial<RetryRule>) {
		if (this.sources.get(sourceId) !== projectId) return Promise.resolve('source_not_found' as const);
		if (this.destinations.get(destinationId) !== projectId) return Promise.resolve('destination_not_found' as const);
		if (this.rows.some((r) => r.source_id === sourceId && r.destination_id === destinationId)) return Promise.resolve('conflict' as const);
		const row: connection = {
			id: this.nextId++,
			source_id: sourceId,
			destination_id: destinationId,
			// DB 기본값
			retry_strategy: retry.retry_strategy ?? 'exponential',
			retry_interval_ms: retry.retry_interval_ms ?? 300_000,
			retry_count: retry.retry_count ?? 9,
			paused_at: null,
			created_at: new Date(0),
			updated_at: new Date(0),
		};
		this.rows.push(row);
		return Promise.resolve(row);
	}
	list(projectId: number, filter: ConnectionFilter, cursor: number | null, take: number) {
		const rows = this.rows
			.filter((r) => this.inProject(projectId, r) && (cursor === null || r.id < cursor))
			.filter((r) => (filter.source_id === undefined || r.source_id === filter.source_id) && (filter.destination_id === undefined || r.destination_id === filter.destination_id))
			.sort((a, b) => b.id - a.id);
		return Promise.resolve(rows.slice(0, take));
	}
	find(projectId: number, id: number) {
		return Promise.resolve(this.rows.find((r) => r.id === id && this.inProject(projectId, r)) ?? null);
	}
	update(projectId: number, id: number, data: Partial<RetryRule> & { paused_at?: Date | null }) {
		const row = this.rows.find((r) => r.id === id && this.inProject(projectId, r));
		if (!row) return Promise.resolve(null);
		Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
		return Promise.resolve(row);
	}
	remove(projectId: number, id: number) {
		const before = this.rows.length;
		this.rows = this.rows.filter((r) => !(r.id === id && this.inProject(projectId, r)));
		return Promise.resolve(this.rows.length < before);
	}
}

async function errorOf(promise: Promise<unknown>) {
	const error = await promise.catch((e: unknown) => e);
	return { type: (error as object).constructor, code: ((error as NotFoundException).getResponse() as { code: string }).code };
}

class FakeHeld implements HeldDeliveries {
	released: number[] = [];

	release(connectionId: number) {
		this.released.push(connectionId);
		return Promise.resolve(0);
	}
}

describe('ConnectionService', () => {
	let repo: FakeConnections;
	let held: FakeHeld;
	let service: ConnectionService;

	beforeEach(() => {
		repo = new FakeConnections();
		held = new FakeHeld();
		service = new ConnectionService(repo, held);
	});

	it('create — 같은 project의 소스와 목적지를 잇는다. 재시도 설정을 안 보내면 2배씩·5분·9회다', async () => {
		expect(await service.create(PROJECT, { source_id: 1, destination_id: 2 })).toMatchObject({
			id: 1,
			source_id: 1,
			destination_id: 2,
			retry_strategy: 'exponential',
			retry_interval_ms: 300_000,
			retry_count: 9,
			paused_at: null,
		});
	});

	it('create — 재시도 설정을 보내면 그 값으로 만든다. 일부만 보내면 나머지는 기본값이다', async () => {
		expect(await service.create(PROJECT, { source_id: 1, destination_id: 1, retry_strategy: 'linear', retry_interval_ms: 60_000, retry_count: 0 })).toMatchObject({
			retry_strategy: 'linear',
			retry_interval_ms: 60_000,
			retry_count: 0,
		});
		expect(await service.create(PROJECT, { source_id: 2, destination_id: 2, retry_count: 50, retry_strategy: null })).toMatchObject({
			retry_strategy: 'exponential',
			retry_interval_ms: 300_000,
			retry_count: 50,
		});
	});

	it('create — 없거나 다른 project의 소스·목적지는 404, 이미 이어져 있으면 409', async () => {
		expect(await errorOf(service.create(PROJECT, { source_id: 9, destination_id: 1 }))).toEqual({ type: NotFoundException, code: 'source_not_found' });
		expect(await errorOf(service.create(PROJECT, { source_id: 1, destination_id: 9 }))).toEqual({ type: NotFoundException, code: 'destination_not_found' });
		expect((await errorOf(service.create(PROJECT, { source_id: 404, destination_id: 1 }))).code).toBe('source_not_found');

		await service.create(PROJECT, { source_id: 1, destination_id: 1 });
		expect(await errorOf(service.create(PROJECT, { source_id: 1, destination_id: 1 }))).toEqual({ type: ConflictException, code: 'connection_conflict' });
		expect(repo.rows).toHaveLength(1);
	});

	it('update — 보낸 재시도 설정만 바꾼다', async () => {
		const { id } = await service.create(PROJECT, { source_id: 1, destination_id: 1 });

		expect(await service.update(PROJECT, id, { retry_count: 3 })).toMatchObject({ retry_strategy: 'exponential', retry_interval_ms: 300_000, retry_count: 3 });
		expect(await service.update(PROJECT, id, { retry_strategy: 'linear', retry_interval_ms: 3_600_000 })).toMatchObject({
			retry_strategy: 'linear',
			retry_interval_ms: 3_600_000,
			retry_count: 3,
		});
		// null은 보내지 않은 것과 같다
		expect(await service.update(PROJECT, id, { retry_count: null })).toMatchObject({ retry_count: 3 });
	});

	it('pause·unpause — 멈춘 시각을 남기고, 다시 멈춰도 처음 시각을 유지하고, 풀면 비운다. 재시도 설정은 그대로다', async () => {
		const { id } = await service.create(PROJECT, { source_id: 1, destination_id: 1, retry_count: 3 });

		expect(await service.pause(PROJECT, id, NOW)).toMatchObject({ paused_at: NOW, retry_count: 3 });
		expect(await service.pause(PROJECT, id, new Date(NOW.getTime() + 60_000))).toMatchObject({ paused_at: NOW });

		expect(held.released).toEqual([]);
		expect(await service.unpause(PROJECT, id)).toMatchObject({ paused_at: null, retry_count: 3 });
		// 풀면 보류해 둔 전달을 이어서 보낸다
		expect(held.released).toEqual([id]);
		// 멈춰 있지 않을 때 풀어도 그대로다
		expect(await service.unpause(PROJECT, id)).toMatchObject({ paused_at: null });
	});

	it('list — id 내림차순 페이지, source_id·destination_id로 거른다', async () => {
		for (const [source_id, destination_id] of [
			[1, 1],
			[1, 2],
			[2, 1],
		] as const) {
			await service.create(PROJECT, { source_id, destination_id });
		}

		const page = await service.list(PROJECT, { limit: 2 });
		expect(page.data.map((c) => c.id)).toEqual([3, 2]);
		expect(page.next_cursor).toBe('2');
		expect((await service.list(PROJECT, { limit: 50, source_id: 1 })).data.map((c) => c.id)).toEqual([2, 1]);
		expect((await service.list(PROJECT, { limit: 50, destination_id: 1 })).data.map((c) => c.id)).toEqual([3, 1]);
		expect((await service.list(PROJECT + 1, { limit: 50 })).data).toEqual([]);
	});

	it('get·update·pause·unpause·remove — 없거나 다른 project면 404 connection_not_found', async () => {
		const { id } = await service.create(PROJECT, { source_id: 1, destination_id: 1 });
		expect(await service.get(PROJECT, id)).toMatchObject({ id });

		const other = PROJECT + 1;
		for (const call of [service.get(other, id), service.update(other, id, { retry_count: 1 }), service.pause(other, id, NOW), service.unpause(other, id), service.remove(other, id)]) {
			expect(await errorOf(call)).toEqual({ type: NotFoundException, code: 'connection_not_found' });
		}

		await service.remove(PROJECT, id);
		expect((await errorOf(service.get(PROJECT, id))).code).toBe('connection_not_found');
		expect((await errorOf(service.remove(PROJECT, id))).code).toBe('connection_not_found');
	});
});
