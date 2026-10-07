import { randomUUID } from 'node:crypto';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import { DELIVERY_STREAM } from '@/modules/deliveries/adapters/valkey-delivery.queue';
import type { EventDetailDto, EventDto, EventPageDto } from '@/modules/events/dto/event.dto';
import { usageKey } from '@/modules/ingress/adapters/valkey-ingress.counters';
import { usagePeriod } from '@/modules/ingress/domain/usage-period';
import { newSlug } from '@/modules/sources/domain/slug';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('events (e2e)', () => {
	let t: TestApp;
	let valkey: ValkeyService;
	let owner: LoggedIn;
	let member: LoggedIn;
	let outsider: LoggedIn;
	let projectId: number;
	let otherProjectId: number;
	let source: { id: number; slug: string };
	let destinationId: number;
	const BODY = '{ "order": 1,\n  "note": "받은 그대로" }';

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (project: number, rest = '') => `/orgs/${owner.org_id}/projects/${project}/events${rest}`;
	const list = async (query = '', as = owner) => (await t.http().get(path(projectId, query)).set(auth(as)).expect(200)).body as EventPageDto;
	const usage = async (who: LoggedIn) => Number((await valkey.get(usageKey(who.org_id, usagePeriod(new Date())))) ?? 0);
	const receive = async (slug: string, body: string, rest = '') => ((await t.http().put(`/in/${slug}${rest}`).set('Content-Type', 'application/json').set('X-Vendor', 'toss').send(body).expect(200)).body as { id: string }).id;
	const queuedIds = async () => (await valkey.xrevrange(DELIVERY_STREAM, '+', '-', 'COUNT', 1000)).map(([, fields]) => fields[1]);

	beforeAll(async () => {
		t = await createTestApp();
		valkey = t.app.get(ValkeyService);
		[owner, member, outsider] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		otherProjectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'blog' } })).id;
		source = await t.prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 's' }, select: { id: true, slug: true } });
		destinationId = (await t.prisma.destination.create({ data: { project_id: projectId, name: 'd', url: 'https://example.com/hook' } })).id;
		await t.prisma.connection.create({ data: { source_id: source.id, destination_id: destinationId } });
	});

	afterAll(() => t.close());

	describe('조회', () => {
		let first: string;
		let second: string;

		beforeAll(async () => {
			// 실제 수신 경로로 만든다. 두 번째는 경로·쿼리가 있다
			first = await receive(source.slug, BODY);
			second = await receive(source.slug, '{"order":2}', '/orders/42?v=2');
		});

		it('목록을 최근 것부터 준다. 본문은 없고 크기만 있다. member도 본다', async () => {
			const page = await list('', member);
			expect(page.data.map((e) => e.id)).toEqual([second, first]);
			expect(page.data[1]).toMatchObject({ project_id: projectId, source_id: source.id, method: 'PUT', path: '', query: '', size: Buffer.byteLength(BODY), content_type: 'application/json', verified: false, headers: { 'x-vendor': 'toss' } });
			expect(page.data[0]).toMatchObject({ path: '/orders/42', query: 'v=2' });
			expect(page.data[0]).not.toHaveProperty('body');
		});

		it('source_id·received_after·received_before로 거른다. 날짜 모양이 틀리면 400', async () => {
			const receivedAt = (await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt(second) } })).received_at;
			expect((await list(`?source_id=${source.id}`)).data).toHaveLength(2);
			expect((await list(`?source_id=${source.id + 1000}`)).data).toEqual([]);
			expect((await list(`?received_after=${receivedAt.toISOString()}`)).data.map((e) => e.id)).toEqual([second]);
			expect((await list(`?received_before=${receivedAt.toISOString()}`)).data.map((e) => e.id)).toEqual([first]);
			expect(errorOf(await t.http().get(path(projectId, '?received_after=yesterday')).set(auth(owner)).expect(400))).toMatchObject({ code: 'validation_failed', details: [{ field: 'received_after' }] });
		});

		it('단건은 그 이벤트의 delivery를 같이 준다', async () => {
			const detail = (await t.http().get(path(projectId, `/${first}`)).set(auth(owner)).expect(200)).body as EventDetailDto;
			expect(detail).toMatchObject({ id: first, method: 'PUT' });
			expect(detail).not.toHaveProperty('body');
			expect(detail.deliveries).toHaveLength(1);
			expect(detail.deliveries[0]).toMatchObject({ event_id: first, destination_id: destinationId, status: 'pending', attempt: 0 });
			expect(typeof detail.deliveries[0]!.id).toBe('string');
		});

		it('본문은 받은 바이트와 Content-Type 그대로 준다', async () => {
			const response = await t.http().get(path(projectId, `/${first}/body`)).set(auth(member)).buffer(true).parse((res, cb) => {
				const chunks: Buffer[] = [];
				res.on('data', (chunk: Buffer) => chunks.push(chunk));
				res.on('end', () => cb(null, Buffer.concat(chunks)));
			});
			expect(response.status).toBe(200);
			expect(response.headers['content-type']).toBe('application/json');
			expect((response.body as Buffer).toString()).toBe(BODY);
		});

		it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
			const page1 = await list('?limit=1');
			expect(page1.next_cursor).toBe(second);
			const page2 = await list(`?limit=1&cursor=${page1.next_cursor}`);
			expect([...page1.data, ...page2.data].map((e) => e.id)).toEqual([second, first]);
			expect(page2.next_cursor).toBeNull();
		});

		it('다른 project의 이벤트는 404(본문도), 타 조직은 404, 토큰이 없으면 401', async () => {
			const other = await t.prisma.event.create({ data: { project_id: otherProjectId, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(2), size: 2 } });
			expect(errorOf(await t.http().get(path(projectId, `/${other.id}`)).set(auth(owner)).expect(404)).code).toBe('event_not_found');
			expect(errorOf(await t.http().get(path(projectId, `/${other.id}/body`)).set(auth(owner)).expect(404)).code).toBe('event_not_found');
			await t.http().get(path(projectId)).set(auth(outsider)).expect(404);
			await t.http().get(path(projectId)).expect(401);
		});
	});

	describe('리플레이', () => {
		it('원본의 방식·경로·쿼리·헤더·본문으로 새 event를 만들고 지금 걸린 연결마다 delivery를 만들어 큐에 넣는다. 사용량 +1', async () => {
			const original = await receive(source.slug, '{"order":"replay"}', '/orders/7?x=1');
			// 리플레이 시점의 연결 기준이다. 목적지를 하나 더 잇는다
			const added = await t.prisma.destination.create({ data: { project_id: projectId, name: 'added', url: 'https://example.com/added' } });
			await t.prisma.connection.create({ data: { source_id: source.id, destination_id: added.id } });
			const used = await usage(owner);

			const replayed = (await t.http().post(path(projectId, `/${original}/replay`)).set(auth(member)).expect(201)).body as EventDto;
			expect(replayed.id).not.toBe(original);
			expect(replayed).toMatchObject({ project_id: projectId, source_id: source.id, method: 'PUT', path: '/orders/7', query: 'x=1', content_type: 'application/json', headers: { 'x-vendor': 'toss' }, size: 18 });
			expect(replayed.idempotency_key).toMatch(new RegExp(`^replay:${original}:\\d+$`));
			expect(replayed).not.toHaveProperty('body');
			expect(await usage(owner)).toBe(used + 1);

			const stored = await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt(replayed.id) }, include: { deliveries: true } });
			expect(Buffer.from(stored.body).toString()).toBe('{"order":"replay"}');
			expect(stored.deliveries.map((d) => d.destination_id).sort()).toEqual([destinationId, added.id].sort());
			const ids = await queuedIds();
			for (const d of stored.deliveries) expect(ids).toContain(d.id.toString());
			// 원본은 그대로다
			expect((await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt(original) }, include: { deliveries: true } })).deliveries).toHaveLength(1);
			await t.prisma.connection.deleteMany({ where: { destination_id: added.id } });
		});

		it('소스가 지워진 이벤트는 409 source_deleted, 연결이 없으면 409 no_connection. 사용량은 그대로', async () => {
			const lonely = await t.prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 'lonely' } });
			const event = await t.prisma.event.create({ data: { project_id: projectId, source_id: lonely.id, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(2), size: 2 } });
			const used = await usage(owner);
			expect(errorOf(await t.http().post(path(projectId, `/${event.id}/replay`)).set(auth(owner)).expect(409)).code).toBe('no_connection');
			await t.prisma.source.delete({ where: { id: lonely.id } });
			expect(errorOf(await t.http().post(path(projectId, `/${event.id}/replay`)).set(auth(owner)).expect(409)).code).toBe('source_deleted');
			expect(await usage(owner)).toBe(used);
		});

		it('free 조직이 월 상한을 넘었으면 429 usage_exceeded. 정지된 project는 403. 타 project는 404', async () => {
			const free = await t.login();
			const freeProject = await t.prisma.project.create({ data: { organization_id: free.org_id, name: 'free' } });
			const freeSource = await t.prisma.source.create({ data: { project_id: freeProject.id, slug: newSlug(), name: 's' } });
			const freeDestination = await t.prisma.destination.create({ data: { project_id: freeProject.id, name: 'd', url: 'https://example.com/free' } });
			await t.prisma.connection.create({ data: { source_id: freeSource.id, destination_id: freeDestination.id } });
			const event = await t.prisma.event.create({ data: { project_id: freeProject.id, source_id: freeSource.id, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(2), size: 2 } });
			const freePath = `/orgs/${free.org_id}/projects/${freeProject.id}/events/${event.id}/replay`;

			await valkey.set(usageKey(free.org_id, usagePeriod(new Date())), 1000);
			expect(errorOf(await t.http().post(freePath).set(auth(free)).expect(429)).code).toBe('usage_exceeded');
			expect(await t.prisma.event.count({ where: { project_id: freeProject.id } })).toBe(1);

			await t.prisma.project.update({ where: { id: freeProject.id }, data: { suspended_at: new Date() } });
			expect(errorOf(await t.http().post(freePath).set(auth(free)).expect(403)).code).toBe('project_suspended');

			await t.http().post(path(projectId, `/${event.id}/replay`)).set(auth(owner)).expect(404);
		});
	});
});
