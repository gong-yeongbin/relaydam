import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DeliveryStatus } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PrismaDeliveryApiRepository } from './prisma-delivery-api.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행)
describe('PrismaDeliveryApiRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const deliveries = new PrismaDeliveryApiRepository(prisma);
	let orgId: number;
	let projectId: number;
	let otherProjectId: number;
	let destinationA: number;
	let destinationB: number;

	async function create(project: number, status: DeliveryStatus, destination = destinationA, created_at = new Date()) {
		const event = await prisma.event.create({ data: { project_id: project, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(2), size: 2 } });
		return prisma.delivery.create({ data: { event_id: event.id, destination_id: destination, status, attempt: status === 'pending' ? 0 : 1, next_attempt_at: status === 'failed' ? new Date() : null, created_at } });
	}
	const status = async (id: bigint) => (await prisma.delivery.findUniqueOrThrow({ where: { id } })).status;

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'delivery api 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		otherProjectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'b' } })).id;
		destinationA = (await prisma.destination.create({ data: { project_id: projectId, name: 'a', url: 'https://example.com/a' } })).id;
		destinationB = (await prisma.destination.create({ data: { project_id: projectId, name: 'b', url: 'https://example.com/b' } })).id;
	});

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('list·find — 그 project의 것만 id 내림차순. status·destination_id·event_id로 거르고 시도 기록을 같이 준다', async () => {
		const failed = await create(projectId, 'failed');
		const dead = await create(projectId, 'dead', destinationB);
		await create(otherProjectId, 'dead');
		await prisma.delivery_attempt.create({ data: { delivery_id: failed.id, attempt_no: 1, trigger: 'initial', status_code: 503, duration_ms: 3 } });

		const all = await deliveries.list(projectId, {}, null, 100);
		expect(all.map((d) => d.id)).toEqual([dead.id, failed.id]);
		expect((await deliveries.list(projectId, {}, dead.id, 100)).map((d) => d.id)).toEqual([failed.id]);
		expect((await deliveries.list(projectId, { status: 'dead' }, null, 100)).map((d) => d.id)).toEqual([dead.id]);
		expect((await deliveries.list(projectId, { destination_id: destinationA }, null, 100)).map((d) => d.id)).toEqual([failed.id]);
		expect((await deliveries.list(projectId, { event_id: failed.event_id }, null, 100)).map((d) => d.id)).toEqual([failed.id]);

		const detail = await deliveries.find(projectId, failed.id);
		expect(detail!.attempts.map((a) => a.status_code)).toEqual([503]);
		expect(await deliveries.find(otherProjectId, failed.id)).toBeNull();
	});

	it('markRetry — pending이 아니면 pending으로 돌린다. pending이면 그대로, 타 project면 not_found', async () => {
		const dead = await create(projectId, 'dead');
		expect(await deliveries.markRetry(projectId, dead.id)).toMatchObject({ id: dead.id, status: 'pending', next_attempt_at: null, attempt: 1 });
		expect(await deliveries.markRetry(projectId, dead.id)).toBe('pending');
		expect(await deliveries.markRetry(otherProjectId, dead.id)).toBe('not_found');
	});

	it('markBulkRetry — 조건에 맞는 것만 limit개(id 오름차순) pending으로 돌리고 id를 준다', async () => {
		const old = await create(projectId, 'canceled', destinationA, new Date('2026-01-01T00:00:00Z'));
		const a = await create(projectId, 'canceled');
		const b = await create(projectId, 'canceled');
		const c = await create(projectId, 'canceled');
		const other = await create(projectId, 'canceled', destinationB);
		await create(otherProjectId, 'canceled');

		const filter = { status: 'canceled' as const, destination_id: destinationA, created_after: new Date('2026-06-01T00:00:00Z') };
		expect(await deliveries.markBulkRetry(projectId, filter, 2)).toEqual([a.id, b.id]);
		expect(await deliveries.markBulkRetry(projectId, filter, 10)).toEqual([c.id]);
		expect(await deliveries.markBulkRetry(projectId, filter, 10)).toEqual([]);
		expect(await status(old.id)).toBe('canceled');
		expect(await status(other.id)).toBe('canceled');
	});

	it('cancel — pending·failed·held만 canceled로. 끝난 것은 closed, 타 project는 not_found', async () => {
		const failed = await create(projectId, 'failed');
		expect(await deliveries.cancel(projectId, failed.id)).toMatchObject({ id: failed.id, status: 'canceled', next_attempt_at: null });
		expect(await deliveries.cancel(projectId, failed.id)).toBe('closed');
		expect(await deliveries.cancel(projectId, (await create(projectId, 'succeeded')).id)).toBe('closed');
		expect(await deliveries.cancel(otherProjectId, failed.id)).toBe('not_found');
	});
});
