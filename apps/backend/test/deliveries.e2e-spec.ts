import { randomUUID } from 'node:crypto';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import { DELIVERY_SCHEDULED, DELIVERY_STREAM } from '@/modules/deliveries/adapters/valkey-delivery.queue';
import type { BulkRetryResultDto, DeliveryDetailDto, DeliveryDto, DeliveryPageDto } from '@/modules/deliveries/dto/delivery.dto';
import { newSlug } from '@/modules/sources/domain/slug';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('deliveries (e2e)', () => {
	let t: TestApp;
	let valkey: ValkeyService;
	let owner: LoggedIn;
	let member: LoggedIn;
	let outsider: LoggedIn;
	let projectId: number;
	let otherProjectId: number;
	let sourceId: number;
	let destinationA: number;
	let destinationB: number;
	let connectionA: number;

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (project: number, rest = '') => `/orgs/${owner.org_id}/projects/${project}/deliveries${rest}`;
	const list = async (query = '', as = owner) => (await t.http().get(path(projectId, query)).set(auth(as)).expect(200)).body as DeliveryPageDto;
	const row = (id: bigint) => t.prisma.delivery.findUniqueOrThrow({ where: { id } });
	// 큐 Stream에서 이 delivery의 항목(사유 포함)을 찾는다
	const queued = async (id: bigint) => {
		const entries = await valkey.xrevrange(DELIVERY_STREAM, '+', '-', 'COUNT', 1000);
		return entries.filter(([, fields]) => fields[1] === id.toString()).map(([, fields]) => fields[3] ?? null);
	};

	// event 하나와 그 event의 delivery(목적지 A)를 만든다
	async function delivery(data: { status?: 'pending' | 'succeeded' | 'failed' | 'dead' | 'canceled' | 'held'; attempt?: number; destination_id?: number; next_attempt_at?: Date; created_at?: Date } = {}, project = projectId) {
		const event = await t.prisma.event.create({ data: { project_id: project, source_id: project === projectId ? sourceId : null, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(Buffer.from('{}')), size: 2 } });
		return t.prisma.delivery.create({ data: { event_id: event.id, destination_id: destinationA, connection_id: connectionA, ...data } });
	}

	beforeAll(async () => {
		t = await createTestApp();
		valkey = t.app.get(ValkeyService);
		[owner, member, outsider] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		otherProjectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'blog' } })).id;
		sourceId = (await t.prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 's' } })).id;
		destinationA = (await t.prisma.destination.create({ data: { project_id: projectId, name: 'a', url: 'https://example.com/a' } })).id;
		destinationB = (await t.prisma.destination.create({ data: { project_id: projectId, name: 'b', url: 'https://example.com/b' } })).id;
		connectionA = (await t.prisma.connection.create({ data: { source_id: sourceId, destination_id: destinationA } })).id;
	});

	afterAll(() => t.close());

	describe('조회', () => {
		let failed: bigint;

		beforeAll(async () => {
			const d = await delivery({ status: 'failed', attempt: 2, next_attempt_at: new Date('2026-10-02T00:10:00Z') });
			failed = d.id;
			await t.prisma.delivery_attempt.createMany({
				data: [
					{ delivery_id: failed, attempt_no: 1, trigger: 'initial', status_code: 503, error: null, duration_ms: 12, response_body: 'busy' },
					{ delivery_id: failed, attempt_no: 2, trigger: 'automatic', status_code: null, error: 'timeout', duration_ms: 5000, response_body: null },
				],
			});
			await delivery({ status: 'succeeded', attempt: 1, destination_id: destinationB });
		});

		it('목록을 최근 것부터 준다. status·destination_id·event_id로 거른다. member도 본다', async () => {
			const page = await list('', member);
			expect(page.data.map((d) => d.status)).toEqual(['succeeded', 'failed']);
			expect(typeof page.data[0]!.id).toBe('string');
			expect(page.data[1]).toMatchObject({ id: failed.toString(), status: 'failed', attempt: 2, destination_id: destinationA, connection_id: connectionA, next_attempt_at: '2026-10-02T00:10:00.000Z' });
			expect(page.data[1]).not.toHaveProperty('attempts');

			expect((await list('?status=failed')).data.map((d) => d.id)).toEqual([failed.toString()]);
			expect((await list(`?destination_id=${destinationB}`)).data.map((d) => d.status)).toEqual(['succeeded']);
			expect((await list(`?event_id=${(await row(failed)).event_id}`)).data.map((d) => d.id)).toEqual([failed.toString()]);
			expect(errorOf(await t.http().get(path(projectId, '?status=lost')).set(auth(owner)).expect(400))).toMatchObject({ code: 'validation_failed', details: [{ field: 'status' }] });
		});

		it('단건은 시도 기록을 오래된 것부터 같이 준다', async () => {
			const detail = (await t.http().get(path(projectId, `/${failed}`)).set(auth(owner)).expect(200)).body as DeliveryDetailDto;
			expect(detail).toMatchObject({ id: failed.toString(), status: 'failed', last_status_code: null });
			expect(detail.attempts.map((a) => [a.attempt_no, a.trigger, a.status_code, a.error, a.response_body])).toEqual([
				[1, 'initial', 503, null, 'busy'],
				[2, 'automatic', null, 'timeout', null],
			]);
			expect(typeof detail.attempts[0]!.id).toBe('string');
		});

		it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
			const first = await list('?limit=1');
			expect(first.next_cursor).not.toBeNull();
			const second = await list(`?limit=1&cursor=${first.next_cursor}`);
			expect([...first.data, ...second.data].map((d) => d.status)).toEqual(['succeeded', 'failed']);
			expect(second.next_cursor).toBeNull();
		});

		it('다른 project의 delivery는 404, 타 조직은 404, 토큰이 없으면 401, id 모양이 틀리면 400', async () => {
			const other = await delivery({}, otherProjectId);
			expect(errorOf(await t.http().get(path(projectId, `/${other.id}`)).set(auth(owner)).expect(404)).code).toBe('delivery_not_found');
			expect((await t.http().get(path(otherProjectId)).set(auth(owner)).expect(200)).body).toMatchObject({ data: [{ id: other.id.toString() }] });
			await t.http().get(path(projectId)).set(auth(outsider)).expect(404);
			await t.http().get(path(projectId)).expect(401);
			await t.http().get(path(projectId, '/abc')).set(auth(owner)).expect(400);
		});
	});

	describe('수동 재시도', () => {
		it('실패한 것을 pending으로 돌리고 manual 사유로 큐에 넣는다. 예정된 자동 재시도 예약은 지운다', async () => {
			const d = await delivery({ status: 'failed', attempt: 3, next_attempt_at: new Date(Date.now() + 600_000) });
			await valkey.zadd(DELIVERY_SCHEDULED, Date.now() + 600_000, d.id.toString());

			const body = (await t.http().post(path(projectId, `/${d.id}/retry`)).set(auth(member)).expect(200)).body as DeliveryDto;
			expect(body).toMatchObject({ id: d.id.toString(), status: 'pending', attempt: 3, next_attempt_at: null });
			expect(await queued(d.id)).toEqual(['manual']);
			expect(await valkey.zscore(DELIVERY_SCHEDULED, d.id.toString())).toBeNull();
		});

		it.each(['succeeded', 'dead', 'canceled', 'held'] as const)('%s인 것도 다시 보낼 수 있다', async (status) => {
			const d = await delivery({ status, attempt: 1 });
			expect((await t.http().post(path(projectId, `/${d.id}/retry`)).set(auth(owner)).expect(200)).body).toMatchObject({ status: 'pending' });
			expect(await queued(d.id)).toEqual(['manual']);
		});

		it('처리 중(pending)인 것은 409. 없거나 타 project면 404', async () => {
			const d = await delivery({ status: 'pending' });
			expect(errorOf(await t.http().post(path(projectId, `/${d.id}/retry`)).set(auth(owner)).expect(409)).code).toBe('delivery_pending');
			expect(await queued(d.id)).toEqual([]);
			const other = await delivery({ status: 'dead' }, otherProjectId);
			await t.http().post(path(projectId, `/${other.id}/retry`)).set(auth(owner)).expect(404);
			await t.http().post(path(projectId, '/999999999999/retry')).set(auth(owner)).expect(404);
		});
	});

	describe('일괄 재시도', () => {
		it('dead 10건 일괄 재시도 → 전부 pending, bulk_retry 사유로 큐에 들어간다. 조건에 안 맞는 것은 그대로', async () => {
			const dead: bigint[] = [];
			for (let i = 0; i < 10; i++) dead.push((await delivery({ status: 'dead', attempt: 10 })).id);
			const otherDestination = await delivery({ status: 'dead', attempt: 10, destination_id: destinationB });
			const notDead = await delivery({ status: 'failed', attempt: 1 });
			const old = await delivery({ status: 'dead', attempt: 10, created_at: new Date('2026-01-01T00:00:00Z') });
			await valkey.zadd(DELIVERY_SCHEDULED, Date.now() + 600_000, dead[0]!.toString());

			const body = (
				await t
					.http()
					.post(path(projectId, '/retry'))
					.set(auth(owner))
					.send({ status: 'dead', destination_id: destinationA, created_after: '2026-06-01T00:00:00Z' })
					.expect(200)
			).body as BulkRetryResultDto;
			expect(body).toEqual({ count: 10 });
			for (const id of dead) {
				expect(await row(id)).toMatchObject({ status: 'pending', attempt: 10, next_attempt_at: null });
				expect(await queued(id)).toEqual(['bulk_retry']);
			}
			expect(await valkey.zscore(DELIVERY_SCHEDULED, dead[0]!.toString())).toBeNull();
			expect((await row(otherDestination.id)).status).toBe('dead');
			expect((await row(notDead.id)).status).toBe('failed');
			expect((await row(old.id)).status).toBe('dead');

			// 다시 부르면 남은 게 없다
			expect((await t.http().post(path(projectId, '/retry')).set(auth(owner)).send({ status: 'dead', destination_id: destinationA, created_after: '2026-06-01T00:00:00Z' }).expect(200)).body).toEqual({ count: 0 });
		});

		it('status가 없거나 재시도할 수 없는 상태면 400. 다른 project의 것은 세지 않는다', async () => {
			expect(errorOf(await t.http().post(path(projectId, '/retry')).set(auth(owner)).send({}).expect(400))).toMatchObject({ code: 'validation_failed', details: [{ field: 'status' }] });
			await t.http().post(path(projectId, '/retry')).set(auth(owner)).send({ status: 'succeeded' }).expect(400);
			await delivery({ status: 'canceled' }, otherProjectId);
			expect((await t.http().post(path(projectId, '/retry')).set(auth(owner)).send({ status: 'canceled' }).expect(200)).body).toEqual({ count: 0 });
		});
	});

	describe('취소', () => {
		it('재시도 대기(failed)·큐 대기(pending)·보류(held)를 canceled로 닫고 예약을 지운다', async () => {
			for (const status of ['failed', 'pending', 'held'] as const) {
				const d = await delivery({ status, next_attempt_at: new Date(Date.now() + 600_000) });
				await valkey.zadd(DELIVERY_SCHEDULED, Date.now() + 600_000, d.id.toString());
				expect((await t.http().post(path(projectId, `/${d.id}/cancel`)).set(auth(member)).expect(200)).body).toMatchObject({ id: d.id.toString(), status: 'canceled', next_attempt_at: null });
				expect(await valkey.zscore(DELIVERY_SCHEDULED, d.id.toString())).toBeNull();
			}
		});

		it('이미 끝난 것(succeeded·dead·canceled)은 409. 없으면 404', async () => {
			for (const status of ['succeeded', 'dead', 'canceled'] as const) {
				const d = await delivery({ status });
				expect(errorOf(await t.http().post(path(projectId, `/${d.id}/cancel`)).set(auth(owner)).expect(409)).code).toBe('delivery_closed');
			}
			await t.http().post(path(projectId, '/999999999999/cancel')).set(auth(owner)).expect(404);
		});
	});
});
