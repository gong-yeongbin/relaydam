import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import type { CreateCheck, Signature, SourceRepository, SourceView } from './ports/source.repository';
import { SourceService } from './source.service';

const PROJECT = 10;
const CONFIG = { header: 'x-signature', encoding: 'hex' as const, signed_payload: '{body}', tolerance_sec: 300 };

// port를 in-memory fake로 둔다. 시크릿은 평문 그대로 들고 있는다(암호화는 adapter 몫)
class FakeSources implements SourceRepository {
	plan: Plan = 'team';
	rows: (SourceView & { signing_secret: string | null })[] = [];
	nextId = 1;

	private view(row: SourceView & { signing_secret: string | null }): SourceView {
		const { signing_secret, ...view } = row;
		void signing_secret;
		return view;
	}
	create(projectId: number, data: { name: string; slug: string } & Signature, check: CreateCheck) {
		check({ plan: this.plan, count: this.rows.filter((r) => r.project_id === projectId).length });
		const row = { id: this.nextId++, project_id: projectId, ...data, created_at: new Date(0), updated_at: new Date(0) };
		this.rows.push(row);
		return Promise.resolve(this.view(row));
	}
	list(projectId: number, cursor: number | null, take: number) {
		const rows = this.rows.filter((r) => r.project_id === projectId && (cursor === null || r.id < cursor)).sort((a, b) => b.id - a.id);
		return Promise.resolve(rows.slice(0, take).map((r) => this.view(r)));
	}
	find(projectId: number, id: number) {
		const row = this.rows.find((r) => r.project_id === projectId && r.id === id);
		return Promise.resolve(row ? this.view(row) : null);
	}
	update(projectId: number, id: number, data: { name?: string; slug?: string } & Partial<Signature>) {
		const row = this.rows.find((r) => r.project_id === projectId && r.id === id);
		if (!row) return Promise.resolve(null);
		Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)));
		return Promise.resolve(this.view(row));
	}
	remove(projectId: number, id: number) {
		const before = this.rows.length;
		this.rows = this.rows.filter((r) => !(r.project_id === projectId && r.id === id));
		return Promise.resolve(this.rows.length < before);
	}
}

async function errorOf(promise: Promise<unknown>) {
	const error = await promise.catch((e: unknown) => e);
	const body = (error as BadRequestException).getResponse() as { code: string; details?: { field: string }[] };
	return { type: (error as object).constructor, code: body.code, field: body.details?.[0]?.field };
}

describe('SourceService', () => {
	let repo: FakeSources;
	let service: SourceService;

	beforeEach(() => {
		repo = new FakeSources();
		service = new SourceService(repo);
	});

	it('create — slug는 서버가 20자로 만들고, 서명 설정이 없으면 둘 다 null', async () => {
		const created = await service.create(PROJECT, { name: 'toss' });
		expect(created).toMatchObject({ project_id: PROJECT, name: 'toss', signature_config: null });
		expect(created.slug).toMatch(/^[a-z0-9]{20}$/);
		expect(created).not.toHaveProperty('signing_secret');
		expect(repo.rows[0]!.signing_secret).toBeNull();
	});

	it('create — 시크릿과 설정을 함께 보내면 저장한다', async () => {
		const created = await service.create(PROJECT, { name: 'github', signing_secret: 's3cret', signature_config: CONFIG });
		expect(created.signature_config).toEqual(CONFIG);
		expect(repo.rows[0]!.signing_secret).toBe('s3cret');
	});

	it('create — 시크릿과 설정 중 하나만 보내면 400 validation_failed (빠진 쪽을 field로)', async () => {
		expect(await errorOf(service.create(PROJECT, { name: 'a', signing_secret: 's' }))).toEqual({ type: BadRequestException, code: 'validation_failed', field: 'signature_config' });
		expect(await errorOf(service.create(PROJECT, { name: 'a', signature_config: CONFIG, signing_secret: null }))).toMatchObject({ field: 'signing_secret' });
		expect(repo.rows).toHaveLength(0);
	});

	it('create — free는 project당 3개, 넘으면 403 plan_limit. 유료와 다른 project는 걸리지 않는다', async () => {
		repo.plan = 'free';
		for (const name of ['a', 'b', 'c']) await service.create(PROJECT, { name });
		expect(await errorOf(service.create(PROJECT, { name: 'd' }))).toMatchObject({ type: ForbiddenException, code: 'plan_limit' });
		await service.create(PROJECT + 1, { name: 'other project' });

		repo.plan = 'team';
		await service.create(PROJECT, { name: 'd' });
		expect(repo.rows).toHaveLength(5);
	});

	it('update — 보내지 않은 필드는 그대로, 시크릿만 보내면 교체, 둘 다 null이면 검증을 끈다', async () => {
		const { id } = await service.create(PROJECT, { name: 'a', signing_secret: 'old', signature_config: CONFIG });

		expect(await service.update(PROJECT, id, { name: 'b' })).toMatchObject({ name: 'b', signature_config: CONFIG });
		await service.update(PROJECT, id, { signing_secret: 'new' });
		expect(repo.rows[0]!.signing_secret).toBe('new');

		expect(await service.update(PROJECT, id, { signing_secret: null, signature_config: null })).toMatchObject({ name: 'b', signature_config: null });
		expect(repo.rows[0]!.signing_secret).toBeNull();
	});

	it('update — 바꾼 뒤 시크릿과 설정 중 하나만 남으면 400', async () => {
		const verifying = await service.create(PROJECT, { name: 'a', signing_secret: 's', signature_config: CONFIG });
		const open = await service.create(PROJECT, { name: 'b' });

		expect(await errorOf(service.update(PROJECT, verifying.id, { signature_config: null }))).toMatchObject({ code: 'validation_failed', field: 'signature_config' });
		expect(await errorOf(service.update(PROJECT, verifying.id, { signing_secret: null }))).toMatchObject({ field: 'signing_secret' });
		expect(await errorOf(service.update(PROJECT, open.id, { signing_secret: 's' }))).toMatchObject({ field: 'signature_config' });
		expect(await errorOf(service.update(PROJECT, open.id, { signature_config: CONFIG }))).toMatchObject({ field: 'signing_secret' });
	});

	it('rotateSlug — slug만 바뀐다', async () => {
		const created = await service.create(PROJECT, { name: 'a' });
		const rotated = await service.rotateSlug(PROJECT, created.id);
		expect(rotated).toMatchObject({ id: created.id, name: 'a' });
		expect(rotated.slug).toMatch(/^[a-z0-9]{20}$/);
		expect(rotated.slug).not.toBe(created.slug);
	});

	it('list — id 내림차순 페이지', async () => {
		for (const name of ['a', 'b', 'c']) await service.create(PROJECT, { name });
		const page = await service.list(PROJECT, { limit: 2 });
		expect(page.data.map((s) => s.name)).toEqual(['c', 'b']);
		expect(page.next_cursor).toBe('2');
	});

	it('get·update·rotateSlug·remove — 없거나 다른 project면 404 source_not_found', async () => {
		const { id } = await service.create(PROJECT, { name: 'a' });
		expect(await errorOf(service.get(PROJECT + 1, id))).toMatchObject({ type: NotFoundException, code: 'source_not_found' });

		await service.remove(PROJECT, id);
		for (const call of [service.get(PROJECT, id), service.update(PROJECT, id, { name: 'x' }), service.rotateSlug(PROJECT, id), service.remove(PROJECT, id)]) {
			expect((await errorOf(call)).code).toBe('source_not_found');
		}
	});
});
