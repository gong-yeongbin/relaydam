import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Plan } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '@/modules/sources/domain/slug';
import { RetentionRunner } from '../retention.runner';
import { PrismaRetentionRepository } from './prisma-retention.repository';

const DAY = 24 * 60 * 60 * 1_000;

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행)
describe('PrismaRetentionRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const retention = new PrismaRetentionRepository(prisma);
	const runner = new RetentionRunner(retention);
	const now = new Date();
	const orgs: number[] = [];

	// 플랜별 조직 하나에 project·source·destination·연결을 만들고, daysAgo일 전에 받은 event(delivery·attempt 포함)와 거부 기록을 하나씩 만든다
	async function setup(plan: Plan, daysAgo: number[]) {
		const org = await prisma.organization.create({ data: { name: `retention ${plan}`, plan } });
		orgs.push(org.id);
		const project = await prisma.project.create({ data: { organization_id: org.id, name: 'p' } });
		const source = await prisma.source.create({ data: { project_id: project.id, slug: newSlug(), name: 's' } });
		const destination = await prisma.destination.create({ data: { project_id: project.id, name: 'd', url: 'https://example.com' } });
		const events = new Map<number, bigint>();
		for (const days of daysAgo) {
			const received_at = new Date(now.getTime() - days * DAY);
			const event = await prisma.event.create({ data: { project_id: project.id, source_id: source.id, idempotency_key: `k:${randomUUID()}`, headers: {}, body: new Uint8Array(2), size: 2, received_at } });
			const delivery = await prisma.delivery.create({ data: { event_id: event.id, destination_id: destination.id, status: 'succeeded', attempt: 1 } });
			await prisma.delivery_attempt.create({ data: { delivery_id: delivery.id, attempt_no: 1, trigger: 'initial', status_code: 200, duration_ms: 1 } });
			await prisma.rejected_request.create({ data: { project_id: project.id, source_id: source.id, reason: 'no_connection', headers: {}, size: 2, received_at } });
			events.set(days, event.id);
		}
		return { project: project.id, events };
	}
	const count = (project: number) =>
		Promise.all([
			prisma.event.count({ where: { project_id: project } }),
			prisma.delivery.count({ where: { event: { project_id: project } } }),
			prisma.delivery_attempt.count({ where: { delivery: { event: { project_id: project } } } }),
			prisma.rejected_request.count({ where: { project_id: project } }),
		]);

	afterAll(async () => {
		await prisma.project.deleteMany({ where: { organization_id: { in: orgs } } });
		await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
		await prisma.$disconnect();
	});

	it('team(보존 7일) 조직의 8일 전 이벤트는 지우고 7일 전 것은 남긴다. delivery·attempt·거부 기록도 같이 간다. free는 3일, business는 30일', async () => {
		const team = await setup('team', [8, 6]);
		const free = await setup('free', [4, 2]);
		const business = await setup('business', [31, 29]);

		const deleted = await runner.run(now);
		// 같은 DB의 다른 오래된 행이 섞일 수 있어 "최소 이만큼"으로 본다
		expect(deleted.team).toBeGreaterThanOrEqual(2);
		expect(deleted.free).toBeGreaterThanOrEqual(2);
		expect(deleted.business).toBeGreaterThanOrEqual(2);

		expect(await count(team.project)).toEqual([1, 1, 1, 1]);
		expect(await prisma.event.findUnique({ where: { id: team.events.get(8)! } })).toBeNull();
		expect(await prisma.event.findUnique({ where: { id: team.events.get(6)! } })).not.toBeNull();
		expect(await count(free.project)).toEqual([1, 1, 1, 1]);
		expect(await prisma.event.findUnique({ where: { id: free.events.get(4)! } })).toBeNull();
		expect(await count(business.project)).toEqual([1, 1, 1, 1]);
		expect(await prisma.event.findUnique({ where: { id: business.events.get(31)! } })).toBeNull();
	});

	it('limit만큼만 지우고 지운 수를 준다', async () => {
		const { project } = await setup('free', [10, 10, 10]);
		const cutoff = new Date(now.getTime() - 3 * DAY);
		expect(await retention.deleteExpiredEvents('free', cutoff, 2)).toBe(2);
		expect(await prisma.event.count({ where: { project_id: project } })).toBe(1);
		expect(await retention.deleteExpiredRejections('free', cutoff, 2)).toBe(2);
		expect(await prisma.rejected_request.count({ where: { project_id: project } })).toBe(1);
	});
});
