import { ConfigService } from '@nestjs/config';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '@/modules/sources/domain/slug';
import type { NewEvent } from '../ports/ingress.repository';
import { PrismaIngressRepository } from './prisma-ingress.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('PrismaIngressRepository (통합)', () => {
	const config = new ConfigService({ DATABASE_URL: process.env.DATABASE_URL, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY });
	const prisma = new PrismaService(config);
	const cipher = new CipherService(config);
	const repository = new PrismaIngressRepository(prisma, cipher);
	const SIGNATURE = { header: 'x-signature', encoding: 'hex', secret_encoding: 'utf8', signed_payload: '{body}', tolerance_sec: 300 };
	let orgId: number;
	let projectId: number;
	let sourceId: number;
	let destinationIds: number[];
	// 소스에 걸린 연결. [{ id, destination_id }]
	let connections: { id: number; destination_id: number }[];
	const slug = newSlug();

	const event = (overrides: Partial<NewEvent> = {}): NewEvent => ({
		project_id: projectId,
		source_id: sourceId,
		idempotency_key: `sha256:${newSlug()}`,
		method: 'POST',
		path: '',
		query: '',
		source_ip: null,
		verified: false,
		headers: { 'content-type': 'application/json' },
		body: Buffer.from('{"order":1}'),
		content_type: 'application/json',
		connections,
		...overrides,
	});

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'ingress 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		sourceId = (await prisma.source.create({ data: { project_id: projectId, slug, name: 'signed', signing_secret_enc: cipher.encrypt('whsec_plain'), signature_config: SIGNATURE } })).id;
		const destination = () => prisma.destination.create({ data: { project_id: projectId, name: 'd', url: 'https://example.com' } });
		destinationIds = [(await destination()).id, (await destination()).id];
		connections = await prisma.connection.createManyAndReturn({ data: destinationIds.map((destination_id) => ({ source_id: sourceId, destination_id })), select: { id: true, destination_id: true } });
	});

	afterAll(async () => {
		// source·destination·event·delivery·rejected_request는 project를 지우면 같이 지워진다(FK cascade)
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('findSourceBySlug — 수신 판단에 필요한 것을 한 번에 읽는다. 시크릿은 복호화한 원문이다', async () => {
		expect(await repository.findSourceBySlug(slug)).toEqual({
			id: sourceId,
			project_id: projectId,
			organization_id: orgId,
			plan: 'team',
			suspended: false,
			signing_secret: 'whsec_plain',
			signature_config: SIGNATURE,
			connections: expect.arrayContaining(connections) as typeof connections,
		});
		expect(await repository.findSourceBySlug(newSlug())).toBeNull();
	});

	it('findSourceBySlug — 서명 설정이 없는 소스, 연결이 없는 소스, 정지된 프로젝트', async () => {
		const suspended = await prisma.project.create({ data: { organization_id: orgId, name: 'suspended', suspended_at: new Date() } });
		const open = await prisma.source.create({ data: { project_id: suspended.id, slug: newSlug(), name: 'open' } });

		expect(await repository.findSourceBySlug(open.slug)).toMatchObject({ suspended: true, signing_secret: null, signature_config: null, connections: [] });
	});

	it('storeEvent — event 한 줄과 목적지마다 pending delivery를 만든다. 본문은 받은 바이트 그대로다', async () => {
		const body = Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x7d]);
		const stored = await repository.storeEvent(event({ body, content_type: null, method: 'PUT', path: '/orders/42', query: 'v=2', source_ip: '203.0.113.7', verified: true }));
		expect(stored.duplicate).toBe(false);
		expect(stored.delivery_ids).toHaveLength(2);

		const row = await prisma.event.findUniqueOrThrow({ where: { id: stored.event_id }, include: { deliveries: true } });
		expect(Buffer.from(row.body).equals(body)).toBe(true);
		expect(row).toMatchObject({ project_id: projectId, source_id: sourceId, size: 5, content_type: null, headers: { 'content-type': 'application/json' } });
		expect(row).toMatchObject({ method: 'PUT', path: '/orders/42', query: 'v=2', source_ip: '203.0.113.7', verified: true });
		// delivery마다 어느 연결에서 만들어졌는지 남는다
		expect(row.deliveries.map((d) => ({ id: d.connection_id, destination_id: d.destination_id })).sort((a, b) => a.id! - b.id!)).toEqual([...connections].sort((a, b) => a.id - b.id));
		expect(row.deliveries.map((d) => d.id).sort()).toEqual([...stored.delivery_ids].sort());
		expect(row.deliveries.every((d) => d.status === 'pending' && d.attempt === 0 && d.next_attempt_at === null)).toBe(true);
		expect(row.deliveries.map((d) => d.destination_id).sort()).toEqual([...destinationIds].sort());
	});

	it('storeEvent — 같은 소스에 같은 멱등 키면 새로 만들지 않고 처음 것을 가리킨다', async () => {
		const first = await repository.storeEvent(event({ idempotency_key: 'id:evt_dup' }));
		const again = await repository.storeEvent(event({ idempotency_key: 'id:evt_dup', body: Buffer.from('different') }));

		expect(again).toEqual({ event_id: first.event_id, delivery_ids: [], duplicate: true });
		expect(await prisma.event.count({ where: { source_id: sourceId, idempotency_key: 'id:evt_dup' } })).toBe(1);
		expect(await prisma.delivery.count({ where: { event_id: first.event_id } })).toBe(2);
	});

	it('storeEvent — delivery를 못 만들면 event도 남지 않는다 (한 트랜잭션)', async () => {
		const key = 'id:evt_rollback';
		await expect(repository.storeEvent(event({ idempotency_key: key, connections: [connections[0]!, { id: connections[0]!.id, destination_id: -1 }] }))).rejects.toThrow();
		expect(await prisma.event.count({ where: { source_id: sourceId, idempotency_key: key } })).toBe(0);
	});

	it('recordRejection — 사유·헤더·크기를 남긴다', async () => {
		await repository.recordRejection({ project_id: projectId, source_id: sourceId, reason: 'signature_mismatch', headers: { 'x-signature': 'bad' }, size: 11 });

		const rows = await prisma.rejected_request.findMany({ where: { source_id: sourceId } });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ project_id: projectId, reason: 'signature_mismatch', headers: { 'x-signature': 'bad' }, size: 11 });
	});
});
