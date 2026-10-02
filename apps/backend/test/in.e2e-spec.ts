import { createHmac, randomUUID } from 'node:crypto';
import { ValkeyService } from '@/infra/valkey/valkey.service';
import { DELIVERY_STREAM } from '@/modules/ingress/adapters/valkey-delivery.queue';
import { usageKey } from '@/modules/ingress/adapters/valkey-ingress.counters';
import { usagePeriod } from '@/modules/ingress/domain/usage-period';
import { newSlug } from '@/modules/sources/domain/slug';
import type { SourceDto } from '@/modules/sources/dto/get-source.dto';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('in (e2e) — 웹훅 수신', () => {
	let t: TestApp;
	let valkey: ValkeyService;
	let owner: LoggedIn;
	let free: LoggedIn;
	let projectId: number;
	// 서명 검증 없는 소스(목적지 2곳에 연결), 서명 검증 있는 소스(목적지 1곳)
	let open: { id: number; slug: string };
	let signed: { id: number; slug: string };
	const SECRET = 'whsec_e2e';

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const json = (slug: string, body: string) => t.http().post(`/in/${slug}`).set('Content-Type', 'application/json').send(body);
	const unique = () => JSON.stringify({ order: randomUUID() });
	const usage = async (who: LoggedIn) => Number((await valkey.get(usageKey(who.org_id, usagePeriod(new Date())))) ?? 0);
	const eventsOf = (sourceId: number) => t.prisma.event.count({ where: { source_id: sourceId } });
	const rejectionsOf = (sourceId: number) => t.prisma.rejected_request.findMany({ where: { source_id: sourceId }, orderBy: { id: 'asc' } });

	// 소스 하나를 만들고 목적지 count곳에 잇는다
	async function source(project: number, destinations: number, signature?: object) {
		const created = await t.prisma.source.create({ data: { project_id: project, slug: newSlug(), name: 's', ...signature } });
		for (let i = 0; i < destinations; i++) {
			const destination = await t.prisma.destination.create({ data: { project_id: project, name: `d${i}`, url: 'https://example.com/hook' } });
			await t.prisma.connection.create({ data: { source_id: created.id, destination_id: destination.id } });
		}
		return { id: created.id, slug: created.slug };
	}

	beforeAll(async () => {
		t = await createTestApp();
		valkey = t.app.get(ValkeyService);
		[owner, free] = [await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		open = await source(projectId, 2);

		// 서명 설정은 API로 넣어 암호화·기본값 채우기까지 실제 경로를 탄다
		signed = await source(projectId, 1);
		await t
			.http()
			.patch(`/orgs/${owner.org_id}/projects/${projectId}/sources/${signed.id}`)
			.set(auth(owner))
			.send({ signing_secret: SECRET, signature_config: { header: 'X-Hub-Signature-256', prefix: 'sha256=', event_id_header: 'X-GitHub-Delivery' } })
			.expect(200);
	});

	afterAll(() => t.close());

	it('받은 웹훅을 바이트 그대로 저장하고 목적지마다 전달할 일을 만들어 큐에 넣는다. 인증은 필요 없다', async () => {
		const raw = '{ "order" : 1,\n  "note": "공백과 줄바꿈도 그대로" }';
		const before = await usage(owner);

		const response = await t.http().post(`/in/${open.slug}`).set('Content-Type', 'application/json; charset=utf-8').set('X-Toss-Event', 'PAYMENT').send(raw).expect(200);
		const id = BigInt((response.body as { id: string }).id);

		const event = await t.prisma.event.findUniqueOrThrow({ where: { id }, include: { deliveries: true } });
		expect(Buffer.from(event.body).toString('utf8')).toBe(raw);
		expect(event).toMatchObject({ project_id: projectId, source_id: open.id, content_type: 'application/json; charset=utf-8', size: Buffer.byteLength(raw) });
		expect(event.headers).toMatchObject({ 'content-type': 'application/json; charset=utf-8', 'x-toss-event': 'PAYMENT' });
		expect(event.deliveries).toHaveLength(2);
		expect(event.deliveries.every((d) => d.status === 'pending')).toBe(true);

		expect(await usage(owner)).toBe(before + 1);
		const queued = (await valkey.xrevrange(DELIVERY_STREAM, '+', '-', 'COUNT', 500)).map(([, fields]) => fields[1]);
		expect(queued).toEqual(expect.arrayContaining(event.deliveries.map((d) => d.id.toString())));
	});

	it('같은 본문을 두 번 보내면 event 1건·delivery 2건이고 같은 id로 답한다', async () => {
		const body = unique();
		const first = (await json(open.slug, body).expect(200)).body as { id: string };
		const again = (await json(open.slug, body).expect(200)).body as { id: string };

		expect(again.id).toBe(first.id);
		expect(await t.prisma.delivery.count({ where: { event_id: BigInt(first.id) } })).toBe(2);
	});

	it('깨진 JSON, 모르는 Content-Type, 글자가 아닌 바이트도 받은 그대로 저장한다', async () => {
		const broken = `{not json ${randomUUID()}`;
		const brokenId = ((await json(open.slug, broken).expect(200)).body as { id: string }).id;
		expect(Buffer.from((await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt(brokenId) } })).body).toString()).toBe(broken);

		const binary = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(randomUUID())]);
		const binaryId = ((await t.http().post(`/in/${open.slug}`).set('Content-Type', 'application/x-custom').send(binary).expect(200)).body as { id: string }).id;
		const stored = await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt(binaryId) } });
		expect(Buffer.from(stored.body).equals(binary)).toBe(true);
		expect(stored.content_type).toBe('application/x-custom');
	});

	it('없는 slug와 모양이 다른 slug는 404 source_not_found', async () => {
		expect(errorOf(await json(newSlug(), '{}').expect(404)).code).toBe('source_not_found');
		expect(errorOf(await json('not-a-slug', '{}').expect(404)).code).toBe('source_not_found');
	});

	describe('서명 검증이 켜진 소스', () => {
		const sign = (body: string) => `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;

		it('서명이 맞으면 받고, 이벤트 ID 헤더가 같으면 같은 웹훅으로 친다', async () => {
			const delivery = randomUUID();
			const body = unique();
			const first = await json(signed.slug, body).set('X-Hub-Signature-256', sign(body)).set('X-GitHub-Delivery', delivery).expect(200);

			const retry = `${body} `;
			const again = await json(signed.slug, retry).set('X-Hub-Signature-256', sign(retry)).set('X-GitHub-Delivery', delivery).expect(200);
			expect((again.body as { id: string }).id).toBe((first.body as { id: string }).id);
		});

		it('서명이 틀리거나 없으면 401 invalid_signature. 저장하지 않고 사용량에 넣지 않고, 거부 기록에 사유와 헤더만 남긴다', async () => {
			const [events, used] = [await eventsOf(signed.id), await usage(owner)];
			const body = unique();

			const wrong = await json(signed.slug, body).set('X-Hub-Signature-256', sign('other body')).expect(401);
			expect(errorOf(wrong)).toEqual({ code: 'invalid_signature', message: '서명이 올바르지 않습니다.' });
			await json(signed.slug, body).expect(401);

			expect(await eventsOf(signed.id)).toBe(events);
			expect(await usage(owner)).toBe(used);

			const rejections = await rejectionsOf(signed.id);
			expect(rejections.map((r) => r.reason)).toEqual(['signature_mismatch', 'signature_missing']);
			expect(rejections[0]).toMatchObject({ project_id: projectId, size: Buffer.byteLength(body), headers: { 'x-hub-signature-256': sign('other body') } });
			// 본문은 어디에도 남지 않는다
			expect(JSON.stringify(rejections.map((r) => r.headers))).not.toContain(body);
			expect(rejections[0]).not.toHaveProperty('body');
		});
	});

	it('본문은 10MiB까지 받는다. 넘으면 본문을 읽지 않고 413 payload_too_large로 답하고 거부 기록을 남긴다', async () => {
		const target = await source(projectId, 1);
		const LIMIT = 10 * 1024 * 1024;

		const accepted = await t.http().post(`/in/${target.slug}`).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(LIMIT, 0x61)).expect(200);
		const stored = await t.prisma.event.findUniqueOrThrow({ where: { id: BigInt((accepted.body as { id: string }).id) }, select: { size: true } });
		expect(stored.size).toBe(LIMIT);

		const rejected = await t.http().post(`/in/${target.slug}`).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(LIMIT + 1, 0x61)).expect(413);
		expect(errorOf(rejected).code).toBe('payload_too_large');
		expect(await eventsOf(target.id)).toBe(1);
		expect((await rejectionsOf(target.id)).map((r) => ({ reason: r.reason, size: r.size }))).toEqual([{ reason: 'payload_too_large', size: LIMIT + 1 }]);

		// 큰 본문을 버린 뒤에도 다음 요청을 정상으로 받는다
		await json(target.slug, unique()).expect(200);
	});

	it('연결이 없는 소스는 409 no_connection. event 0건, 사용량 그대로', async () => {
		const lonely = await source(projectId, 0);
		const used = await usage(owner);

		expect(errorOf(await json(lonely.slug, unique()).expect(409)).code).toBe('no_connection');
		expect(await eventsOf(lonely.id)).toBe(0);
		expect(await usage(owner)).toBe(used);
		expect((await rejectionsOf(lonely.id)).map((r) => r.reason)).toEqual(['no_connection']);
	});

	it('정지된 프로젝트의 소스는 403 project_suspended. event 0건', async () => {
		const suspended = await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'suspended', suspended_at: new Date() } });
		const target = await source(suspended.id, 1);

		expect(errorOf(await json(target.slug, unique()).expect(403)).code).toBe('project_suspended');
		expect(await eventsOf(target.id)).toBe(0);
		expect((await rejectionsOf(target.id)).map((r) => r.reason)).toEqual(['project_suspended']);
	});

	it('free 조직은 월 1,000건까지 받고 그 뒤는 429 usage_exceeded', async () => {
		const project = await t.prisma.project.create({ data: { organization_id: free.org_id, name: 'trial' } });
		const target = await source(project.id, 1);
		// 999건을 이미 받은 것으로 둔다
		await valkey.set(usageKey(free.org_id, usagePeriod(new Date())), 999);

		await json(target.slug, unique()).expect(200);
		expect(errorOf(await json(target.slug, unique()).expect(429)).code).toBe('usage_exceeded');
		expect(await eventsOf(target.id)).toBe(1);
		expect((await rejectionsOf(target.id)).map((r) => r.reason)).toEqual(['usage_exceeded']);
	});

	it('거부 기록은 소스당 분당 10건까지만 남긴다. 거부는 계속한다', async () => {
		const lonely = await source(projectId, 0);
		for (let i = 0; i < 25; i++) await json(lonely.slug, '{}').expect(409);

		// 실행 중에 분이 바뀌면 두 칸에 걸쳐 최대 20건이다
		const recorded = (await rejectionsOf(lonely.id)).length;
		expect(recorded).toBeGreaterThanOrEqual(10);
		expect(recorded).toBeLessThanOrEqual(20);
	});

	it('slug를 재발급하면 옛 주소는 404, 새 주소로 받는다', async () => {
		const target = await source(projectId, 1);
		const rotated = (await t.http().post(`/orgs/${owner.org_id}/projects/${projectId}/sources/${target.id}/rotate-slug`).set(auth(owner)).expect(200)).body as SourceDto;

		await json(target.slug, unique()).expect(404);
		await json(rotated.slug, unique()).expect(200);
	});

	it('소스를 지워도 이벤트는 남고 source_id가 비워진다. 프로젝트를 지우면 이벤트도 사라진다', async () => {
		const project = await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'to-delete' } });
		const target = await source(project.id, 1);
		const id = BigInt(((await json(target.slug, unique()).expect(200)).body as { id: string }).id);

		await t.http().delete(`/orgs/${owner.org_id}/projects/${project.id}/sources/${target.id}`).set(auth(owner)).expect(204);
		await json(target.slug, unique()).expect(404);
		expect(await t.prisma.event.findUnique({ where: { id } })).toMatchObject({ project_id: project.id, source_id: null });
		expect(await t.prisma.delivery.count({ where: { event_id: id } })).toBe(1);

		await t.http().delete(`/orgs/${owner.org_id}/projects/${project.id}`).set(auth(owner)).expect(204);
		expect(await t.prisma.event.findUnique({ where: { id } })).toBeNull();
		expect(await t.prisma.delivery.count({ where: { event_id: id } })).toBe(0);
	});
});
