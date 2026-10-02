import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { ProjectService } from './project.service';
import type { CreateCheck, ProjectRepository, ProjectView } from './ports/project.repository';

const ORG = 1;

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeProjects implements ProjectRepository {
	plan: Plan = 'team';
	rows: ProjectView[] = [];
	// 서명 키는 평문 그대로 들고 있는다(암호화는 adapter 몫). 키가 없는 예전 project는 null
	secrets = new Map<number, string | null>();
	nextId = 1;

	private taken(orgId: number, name: string, exceptId?: number) {
		return this.rows.some((r) => r.organization_id === orgId && r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase());
	}
	create(orgId: number, data: { name: string; signing_secret: string }, check: CreateCheck) {
		check({ plan: this.plan, count: this.rows.filter((r) => r.organization_id === orgId).length });
		if (this.taken(orgId, data.name)) return Promise.resolve('name_conflict' as const);
		const row = { id: this.nextId++, organization_id: orgId, name: data.name, suspended_at: null, created_at: new Date(0), updated_at: new Date(0) };
		this.rows.push(row);
		this.secrets.set(row.id, data.signing_secret);
		return Promise.resolve(row);
	}
	findSigningSecret(orgId: number, id: number) {
		const row = this.rows.find((r) => r.organization_id === orgId && r.id === id);
		return Promise.resolve(row ? (this.secrets.get(id) ?? null) : undefined);
	}
	setSigningSecret(orgId: number, id: number, secret: string) {
		const row = this.rows.find((r) => r.organization_id === orgId && r.id === id);
		if (row) this.secrets.set(id, secret);
		return Promise.resolve(row !== undefined);
	}
	list(orgId: number, cursor: number | null, take: number) {
		const rows = this.rows.filter((r) => r.organization_id === orgId && (cursor === null || r.id < cursor)).sort((a, b) => b.id - a.id);
		return Promise.resolve(rows.slice(0, take));
	}
	find(orgId: number, id: number) {
		return Promise.resolve(this.rows.find((r) => r.organization_id === orgId && r.id === id) ?? null);
	}
	update(orgId: number, id: number, data: { name?: string }) {
		const row = this.rows.find((r) => r.organization_id === orgId && r.id === id);
		if (!row) return Promise.resolve(null);
		if (data.name && this.taken(orgId, data.name, id)) return Promise.resolve('name_conflict' as const);
		Object.assign(row, data);
		return Promise.resolve(row);
	}
	remove(orgId: number, id: number) {
		const before = this.rows.length;
		this.rows = this.rows.filter((r) => !(r.organization_id === orgId && r.id === id));
		return Promise.resolve(this.rows.length < before);
	}
}

async function errorOf(promise: Promise<unknown>) {
	const error = await promise.catch((e: unknown) => e);
	return { type: (error as object).constructor, code: ((error as ForbiddenException).getResponse() as { code: string }).code };
}

describe('ProjectService', () => {
	let repo: FakeProjects;
	let service: ProjectService;

	beforeEach(() => {
		repo = new FakeProjects();
		service = new ProjectService(repo);
	});

	it('create — 유료는 상한 없음', async () => {
		for (const name of ['a', 'b', 'c', 'd']) expect(await service.create(ORG, { name })).toMatchObject({ organization_id: ORG, name, suspended_at: null });
		expect(repo.rows).toHaveLength(4);
	});

	it('create — free는 1개, 넘으면 403 plan_limit', async () => {
		repo.plan = 'free';
		await service.create(ORG, { name: 'a' });
		expect(await errorOf(service.create(ORG, { name: 'b' }))).toEqual({ type: ForbiddenException, code: 'plan_limit' });
	});

	it('같은 조직에 같은 이름(대소문자 무시)이면 생성·이름 변경 409 project_conflict', async () => {
		await service.create(ORG, { name: 'shop' });
		const blog = await service.create(ORG, { name: 'blog' });

		expect(await errorOf(service.create(ORG, { name: 'SHOP' }))).toEqual({ type: ConflictException, code: 'project_conflict' });
		expect((await errorOf(service.update(ORG, blog.id, { name: 'Shop' }))).code).toBe('project_conflict');
		// 자기 이름으로 바꾸는 것은 충돌이 아니다
		expect(await service.update(ORG, blog.id, { name: 'Blog' })).toMatchObject({ name: 'Blog' });
	});

	describe('전달 서명 키', () => {
		it('만들 때 같이 발급하고, 조회하면 그 키가 나온다. 응답에는 키가 없다', async () => {
			const created = await service.create(ORG, { name: 'a' });
			expect(created).not.toHaveProperty('signing_secret');
			expect(created).not.toHaveProperty('signing_secret_enc');

			const { signing_secret } = await service.getSigningSecret(ORG, created.id);
			expect(signing_secret).toMatch(/^rdsec_[A-Za-z0-9_-]{43}$/);
			expect(await service.getSigningSecret(ORG, created.id)).toEqual({ signing_secret });
		});

		it('교체하면 새 키가 나오고 그 뒤 조회도 새 키다', async () => {
			const { id } = await service.create(ORG, { name: 'a' });
			const before = await service.getSigningSecret(ORG, id);

			const rotated = await service.rotateSigningSecret(ORG, id);
			expect(rotated.signing_secret).not.toBe(before.signing_secret);
			expect(await service.getSigningSecret(ORG, id)).toEqual(rotated);
		});

		it('키가 없는 예전 project는 처음 조회할 때 만든다', async () => {
			const { id } = await service.create(ORG, { name: 'legacy' });
			repo.secrets.set(id, null);

			const first = await service.getSigningSecret(ORG, id);
			expect(first.signing_secret).toMatch(/^rdsec_/);
			expect(await service.getSigningSecret(ORG, id)).toEqual(first);
		});

		it('없거나 다른 조직의 project면 404 project_not_found', async () => {
			const { id } = await service.create(ORG, { name: 'a' });
			expect(await errorOf(service.getSigningSecret(ORG + 1, id))).toEqual({ type: NotFoundException, code: 'project_not_found' });
			expect((await errorOf(service.rotateSigningSecret(ORG + 1, id))).code).toBe('project_not_found');
		});
	});

	it('list — id 내림차순 페이지', async () => {
		for (const name of ['a', 'b', 'c']) await service.create(ORG, { name });
		const page = await service.list(ORG, { limit: 2 });
		expect(page.data.map((p) => p.name)).toEqual(['c', 'b']);
		expect(page.next_cursor).toBe('2');
	});

	it('get·update·remove — 없으면 404 project_not_found', async () => {
		const created = await service.create(ORG, { name: 'a' });

		expect(await service.get(ORG, created.id)).toMatchObject({ name: 'a' });
		expect(await service.update(ORG, created.id, { name: 'b' })).toMatchObject({ name: 'b' });
		await service.remove(ORG, created.id);

		expect(await errorOf(service.get(ORG, created.id))).toEqual({ type: NotFoundException, code: 'project_not_found' });
		expect((await errorOf(service.update(ORG, created.id, { name: 'c' }))).code).toBe('project_not_found');
		expect((await errorOf(service.remove(ORG, created.id))).code).toBe('project_not_found');
	});
});
