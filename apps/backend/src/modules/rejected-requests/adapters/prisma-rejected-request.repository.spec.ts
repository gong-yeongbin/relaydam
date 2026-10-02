import { ConfigService } from '@nestjs/config';
import type { RejectionReason } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '@/modules/sources/domain/slug';
import { PrismaRejectedRequestRepository } from './prisma-rejected-request.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('PrismaRejectedRequestRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const rejections = new PrismaRejectedRequestRepository(prisma);
	let orgId: number;
	let projectId: number;
	let otherProjectId: number;
	let sourceA: number;
	let sourceB: number;

	const record = (project_id: number, source_id: number, reason: RejectionReason) =>
		prisma.rejected_request.create({ data: { project_id, source_id, reason, headers: { 'x-signature': 'bad' }, size: 11 } });

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'rejected 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		otherProjectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'b' } })).id;
		const source = async (project: number) => (await prisma.source.create({ data: { project_id: project, slug: newSlug(), name: 's' } })).id;
		[sourceA, sourceB] = [await source(projectId), await source(projectId)];

		await record(projectId, sourceA, 'signature_mismatch');
		await record(projectId, sourceA, 'no_connection');
		await record(projectId, sourceB, 'signature_mismatch');
		await record(otherProjectId, await source(otherProjectId), 'signature_mismatch');
	});

	afterAll(async () => {
		// source·rejected_request는 project를 지우면 같이 지워진다(FK cascade)
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('list — 그 project의 것만 id 내림차순, cursor보다 작은 것부터', async () => {
		const all = await rejections.list(projectId, {}, null, 100);
		expect(all).toHaveLength(3);
		expect(all.map((r) => r.id)).toEqual([...all.map((r) => r.id)].sort((x, y) => Number(y - x)));
		expect(all[0]).toMatchObject({ project_id: projectId, headers: { 'x-signature': 'bad' }, size: 11 });

		expect((await rejections.list(projectId, {}, all[0]!.id, 100)).map((r) => r.id)).toEqual(all.slice(1).map((r) => r.id));
		expect(await rejections.list(projectId, {}, null, 2)).toHaveLength(2);
	});

	it('list — source_id·reason으로 거른다', async () => {
		expect(await rejections.list(projectId, { source_id: sourceA }, null, 100)).toHaveLength(2);
		expect(await rejections.list(projectId, { reason: 'signature_mismatch' }, null, 100)).toHaveLength(2);
		expect((await rejections.list(projectId, { source_id: sourceA, reason: 'no_connection' }, null, 100)).map((r) => r.reason)).toEqual(['no_connection']);
	});

	it('소스를 지워도 기록은 남고 source_id가 비워진다', async () => {
		await prisma.source.delete({ where: { id: sourceB } });
		const all = await rejections.list(projectId, {}, null, 100);
		expect(all).toHaveLength(3);
		expect(all.filter((r) => r.source_id === null)).toHaveLength(1);
	});
});
