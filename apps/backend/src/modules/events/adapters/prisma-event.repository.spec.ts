import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '@/modules/sources/domain/slug';
import { PrismaEventRepository } from './prisma-event.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행)
describe('PrismaEventRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const events = new PrismaEventRepository(prisma);
	const BODY = Buffer.from('{"n":1}');
	let orgId: number;
	let projectId: number;
	let otherProjectId: number;
	let sourceId: number;
	let destinationId: number;
	let connectionId: number;
	let ids: bigint[];

	const create = (project: number, source: number | null, received_at: Date) =>
		prisma.event.create({ data: { project_id: project, source_id: source, idempotency_key: `k:${randomUUID()}`, method: 'PUT', path: '/a', query: 'q=1', headers: { 'x-v': '1' }, body: new Uint8Array(BODY), content_type: 'application/json', size: BODY.length, received_at } });

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'event 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		otherProjectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'b' } })).id;
		sourceId = (await prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 's' } })).id;
		destinationId = (await prisma.destination.create({ data: { project_id: projectId, name: 'd', url: 'https://example.com' } })).id;
		connectionId = (await prisma.connection.create({ data: { source_id: sourceId, destination_id: destinationId } })).id;
		ids = [];
		for (const day of [1, 2, 3]) ids.push((await create(projectId, sourceId, new Date(`2026-10-0${day}T00:00:00Z`))).id);
		ids.push((await create(projectId, null, new Date('2026-10-04T00:00:00Z'))).id);
		await create(otherProjectId, null, new Date('2026-10-05T00:00:00Z'));
		await prisma.delivery.create({ data: { event_id: ids[0]!, destination_id: destinationId, connection_id: connectionId } });
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('list — 그 project의 것만 id 내림차순, 본문 없이. cursor·source_id·기간으로 거른다', async () => {
		const all = await events.list(projectId, {}, null, 100);
		expect(all.map((e) => e.id)).toEqual([...ids].reverse());
		expect(all[0]).not.toHaveProperty('body');
		expect(all[0]).toMatchObject({ method: 'PUT', path: '/a', query: 'q=1', headers: { 'x-v': '1' }, size: BODY.length });
		expect((await events.list(projectId, {}, ids[2]!, 100)).map((e) => e.id)).toEqual([ids[1], ids[0]]);
		expect(await events.list(projectId, {}, null, 2)).toHaveLength(2);
		expect((await events.list(projectId, { source_id: sourceId }, null, 100)).map((e) => e.id)).toEqual([ids[2], ids[1], ids[0]]);
		expect((await events.list(projectId, { received_after: new Date('2026-10-02T00:00:00Z'), received_before: new Date('2026-10-04T00:00:00Z') }, null, 100)).map((e) => e.id)).toEqual([ids[2], ids[1]]);
	});

	it('find — delivery를 같이, findBody — 바이트와 content_type. 타 project는 null', async () => {
		const detail = await events.find(projectId, ids[0]!);
		expect(detail).not.toHaveProperty('body');
		expect(detail!.deliveries).toHaveLength(1);
		expect(detail!.deliveries[0]).toMatchObject({ destination_id: destinationId, status: 'pending' });
		expect(await events.find(otherProjectId, ids[0]!)).toBeNull();

		const body = await events.findBody(projectId, ids[0]!);
		expect(body!.body.equals(BODY)).toBe(true);
		expect(body!.content_type).toBe('application/json');
		expect(await events.findBody(otherProjectId, ids[0]!)).toBeNull();
	});

	it('findForReplay — 소스의 지금 연결과 조직 플랜·정지 여부를 같이 준다. 소스가 지워진 event는 source null', async () => {
		const found = await events.findForReplay(projectId, ids[0]!);
		expect(found!.event.id).toBe(ids[0]);
		expect(Buffer.from(found!.event.body).equals(BODY)).toBe(true);
		expect(found!.source).toEqual({ id: sourceId, connections: [{ id: connectionId, destination_id: destinationId }] });
		expect(found!.project).toEqual({ organization_id: orgId, plan: 'team', suspended: false });
		expect((await events.findForReplay(projectId, ids[3]!))!.source).toBeNull();
		expect(await events.findForReplay(otherProjectId, ids[0]!)).toBeNull();
	});

	it('storeReplay — event와 연결마다 delivery(pending)를 만든다', async () => {
		const stored = await events.storeReplay({
			project_id: projectId,
			source_id: sourceId,
			idempotency_key: `replay:${ids[0]}:1`,
			method: 'PUT',
			path: '/a',
			query: 'q=1',
			source_ip: '203.0.113.7',
			verified: true,
			headers: { 'x-v': '1' },
			body: BODY,
			content_type: 'application/json',
			connections: [{ id: connectionId, destination_id: destinationId }],
		});
		expect(stored.event).toMatchObject({ project_id: projectId, source_id: sourceId, size: BODY.length, verified: true });
		expect(stored.event).not.toHaveProperty('body');
		expect(stored.delivery_ids).toHaveLength(1);
		expect(await prisma.delivery.findUnique({ where: { id: stored.delivery_ids[0]! } })).toMatchObject({ event_id: stored.event.id, destination_id: destinationId, connection_id: connectionId, status: 'pending' });
	});
});
