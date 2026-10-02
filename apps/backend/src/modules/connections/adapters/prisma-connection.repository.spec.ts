import { ConfigService } from '@nestjs/config';
import type { connection } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '@/modules/sources/domain/slug';
import { PrismaConnectionRepository } from './prisma-connection.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('PrismaConnectionRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const connections = new PrismaConnectionRepository(prisma);
	let orgId: number;
	let projectId: number;
	let otherProjectId: number;
	// [이 project의 것 둘, 다른 project의 것 하나]
	let sources: number[];
	let destinations: number[];

	const source = async (project: number) => (await prisma.source.create({ data: { project_id: project, slug: newSlug(), name: 's' } })).id;
	const destination = async (project: number) => (await prisma.destination.create({ data: { project_id: project, name: 'd', url: 'https://example.com' } })).id;

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'connection 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		otherProjectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'b' } })).id;
		sources = [await source(projectId), await source(projectId), await source(otherProjectId)];
		destinations = [await destination(projectId), await destination(projectId), await destination(otherProjectId)];
	});

	afterAll(async () => {
		// source·destination·connection은 project를 지우면 같이 지워진다(FK cascade)
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('create — 둘 다 그 project의 것이어야 만든다. 한 쌍은 한 번만', async () => {
		expect(await connections.create(projectId, sources[0]!, destinations[0]!, {})).toMatchObject({ source_id: sources[0], destination_id: destinations[0] });

		expect(await connections.create(projectId, sources[2]!, destinations[0]!, {})).toBe('source_not_found');
		expect(await connections.create(projectId, sources[0]!, destinations[2]!, {})).toBe('destination_not_found');
		expect(await connections.create(projectId, sources[0]!, destinations[0]!, {})).toBe('conflict');
		expect(await prisma.connection.count({ where: { source_id: sources[0] } })).toBe(1);
	});

	it('create — 재시도 설정을 안 주면 DB 기본값(2배씩·5분·9회), 주면 그 값이다', async () => {
		const defaults = (await connections.create(otherProjectId, sources[2]!, destinations[2]!, {})) as connection;
		expect(defaults).toMatchObject({ retry_strategy: 'exponential', retry_interval_ms: 300_000, retry_count: 9, paused_at: null });
		await prisma.connection.delete({ where: { id: defaults.id } });

		const custom = (await connections.create(otherProjectId, sources[2]!, destinations[2]!, { retry_strategy: 'linear', retry_interval_ms: 60_000, retry_count: 0 })) as connection;
		expect(custom).toMatchObject({ retry_strategy: 'linear', retry_interval_ms: 60_000, retry_count: 0 });
		await prisma.connection.delete({ where: { id: custom.id } });
	});

	it('update — 준 필드만 바꾼다. paused_at은 채우고 비울 수 있다. 다른 project의 id는 null', async () => {
		const c = (await connections.create(projectId, sources[1]!, destinations[1]!, {})) as connection;
		const pausedAt = new Date('2026-10-02T03:00:00Z');

		expect(await connections.update(projectId, c.id, { retry_count: 3 })).toMatchObject({ retry_strategy: 'exponential', retry_interval_ms: 300_000, retry_count: 3 });
		expect(await connections.update(projectId, c.id, { paused_at: pausedAt })).toMatchObject({ paused_at: pausedAt, retry_count: 3 });
		expect(await connections.update(projectId, c.id, { paused_at: null })).toMatchObject({ paused_at: null });

		expect(await connections.update(otherProjectId, c.id, { retry_count: 1 })).toBeNull();
		expect(await connections.find(projectId, c.id)).toMatchObject({ retry_count: 3 });
		await prisma.connection.delete({ where: { id: c.id } });
	});

	it('list — id 내림차순, cursor보다 작은 것부터. 필터와 project 범위가 걸린다', async () => {
		await connections.create(projectId, sources[0]!, destinations[1]!, {});
		await connections.create(projectId, sources[1]!, destinations[0]!, {});
		await connections.create(otherProjectId, sources[2]!, destinations[2]!, {});

		const all = await connections.list(projectId, {}, null, 100);
		expect(all).toHaveLength(3);
		expect(all.map((c) => c.id)).toEqual([...all.map((c) => c.id)].sort((x, y) => y - x));
		expect((await connections.list(projectId, {}, all[0]!.id, 100)).map((c) => c.id)).toEqual(all.slice(1).map((c) => c.id));

		expect((await connections.list(projectId, { source_id: sources[0] }, null, 100)).map((c) => c.destination_id).sort()).toEqual([destinations[0], destinations[1]].sort());
		expect(await connections.list(projectId, { destination_id: destinations[0] }, null, 100)).toHaveLength(2);
		// 다른 project의 source_id로 걸러도 이 project 범위 밖이라 비어 있다
		expect(await connections.list(projectId, { source_id: sources[2] }, null, 100)).toEqual([]);
	});

	it('find·remove — 다른 project의 id는 null/false', async () => {
		const c = (await connections.create(projectId, sources[1]!, destinations[1]!, {})) as connection;

		expect(await connections.find(otherProjectId, c.id)).toBeNull();
		expect(await connections.remove(otherProjectId, c.id)).toBe(false);

		expect(await connections.find(projectId, c.id)).toMatchObject({ id: c.id });
		expect(await connections.remove(projectId, c.id)).toBe(true);
		expect(await connections.find(projectId, c.id)).toBeNull();
	});

	it('소스를 지우면 그 소스의 연결도 지워진다', async () => {
		await prisma.source.delete({ where: { id: sources[0] } });
		expect(await connections.list(projectId, { source_id: sources[0] }, null, 100)).toEqual([]);
	});
});
