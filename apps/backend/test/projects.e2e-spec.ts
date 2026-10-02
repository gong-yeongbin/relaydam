import type { ProjectDto, ProjectPageDto } from '@/modules/projects/dto/get-project.dto';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('projects (e2e)', () => {
	let t: TestApp;
	let owner: LoggedIn;
	let member: LoggedIn;
	let outsider: LoggedIn;

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (who: LoggedIn, projectId?: number) => `/orgs/${who.org_id}/projects${projectId ? `/${projectId}` : ''}`;
	const create = (who: LoggedIn, name: string, as = who) => t.http().post(path(who)).set(auth(as)).send({ name });

	beforeAll(async () => {
		t = await createTestApp();
		[owner, member, outsider] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
	});

	afterAll(() => t.close());

	it('가입 직후 project 0개', async () => {
		const page = (await t.http().get(path(outsider)).set(auth(outsider)).expect(200)).body as ProjectPageDto;
		expect(page).toEqual({ data: [], next_cursor: null });
	});

	it('plan=free 조직의 2번째 project 생성 403 plan_limit', async () => {
		await create(outsider, 'first').expect(201);
		const response = await create(outsider, 'second').expect(403);
		expect(errorOf(response).code).toBe('plan_limit');
	});

	it('admin 이상이 만들고·바꾸고·지우며, member는 조회만(쓰기 403)', async () => {
		const created = (await create(owner, 'shop').expect(201)).body as ProjectDto;
		expect(created).toMatchObject({ organization_id: owner.org_id, name: 'shop', suspended_at: null });

		await create(owner, 'blog', member).expect(403);
		await t.http().patch(path(owner, created.id)).set(auth(member)).send({ name: 'x' }).expect(403);
		const got = await t.http().get(path(owner, created.id)).set(auth(member)).expect(200);
		expect(got.body).toMatchObject({ id: created.id, name: 'shop' });

		const renamed = await t.http().patch(path(owner, created.id)).set(auth(owner)).send({ name: 'shop-prod' }).expect(200);
		expect(renamed.body).toMatchObject({ name: 'shop-prod' });
		await t.http().delete(path(owner, created.id)).set(auth(owner)).expect(204);
		await t.http().get(path(owner, created.id)).set(auth(owner)).expect(404);
	});

	it('같은 조직에 같은 이름(대소문자 무시)이면 생성·이름 변경 409 project_conflict', async () => {
		await create(owner, 'Payments').expect(201);
		const other = (await create(owner, 'orders').expect(201)).body as ProjectDto;

		const dup = await create(owner, 'payments').expect(409);
		expect(errorOf(dup).code).toBe('project_conflict');
		await t.http().patch(path(owner, other.id)).set(auth(owner)).send({ name: 'PAYMENTS' }).expect(409);
		// 다른 조직은 같은 이름을 쓸 수 있다(outsider는 free라 이미 1개가 있어 상한에 걸리므로 member 조직으로 본다)
		await t.prisma.organization.update({ where: { id: member.org_id }, data: { plan: 'team' } });
		await create(member, 'payments').expect(201);

		// 아래 목록 테스트가 owner 조직의 project를 이름으로 확인하므로 여기서 만든 것은 지운다
		await t.prisma.project.deleteMany({ where: { organization_id: owner.org_id, name: { in: ['Payments', 'orders'] } } });
	});

	it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
		for (const name of ['a', 'b', 'c']) await create(owner, name).expect(201);
		const first = (await t.http().get(`${path(owner)}?limit=2`).set(auth(member)).expect(200)).body as ProjectPageDto;
		const second = (await t.http().get(`${path(owner)}?limit=2&cursor=${first.next_cursor}`).set(auth(member)).expect(200)).body as ProjectPageDto;
		expect([...first.data, ...second.data].map((p) => p.name)).toEqual(['c', 'b', 'a']);
		expect(second.next_cursor).toBeNull();
	});

	it('타 조직 project id로 접근 404 project_not_found', async () => {
		const theirs = (await t.http().get(path(outsider)).set(auth(outsider)).expect(200)).body as ProjectPageDto;
		const otherId = theirs.data[0]!.id;

		const response = await t.http().get(path(owner, otherId)).set(auth(owner)).expect(404);
		expect(errorOf(response).code).toBe('project_not_found');
		await t.http().delete(path(owner, otherId)).set(auth(owner)).expect(404);
	});

	describe('전달 서명 키', () => {
		let id: number;
		const secretPath = (suffix = '') => `${path(owner, id)}/signing-secret${suffix}`;

		beforeAll(async () => {
			id = ((await create(owner, 'signed').expect(201)).body as ProjectDto).id;
		});

		it('프로젝트 응답에는 서명 키가 없다', async () => {
			const got = await t.http().get(path(owner, id)).set(auth(owner)).expect(200);
			const listed = await t.http().get(path(owner)).set(auth(owner)).expect(200);
			for (const text of [got.text, listed.text]) expect(text).not.toMatch(/signing_secret|rdsec_/);
		});

		it('admin 이상이 조회한다. 만들 때 발급된 키가 나오고 DB에는 암호문이다. member는 403', async () => {
			const { signing_secret } = (await t.http().get(secretPath()).set(auth(owner)).expect(200)).body as { signing_secret: string };
			expect(signing_secret).toMatch(/^rdsec_[A-Za-z0-9_-]{43}$/);
			expect((await t.http().get(secretPath()).set(auth(owner)).expect(200)).body).toEqual({ signing_secret });

			const row = await t.prisma.project.findUniqueOrThrow({ where: { id } });
			expect(row.signing_secret_enc).toBeTruthy();
			expect(row.signing_secret_enc).not.toContain(signing_secret);

			await t.http().get(secretPath()).set(auth(member)).expect(403);
		});

		it('교체하면 새 키가 나오고 그 뒤 조회도 새 키다. member는 403', async () => {
			const before = (await t.http().get(secretPath()).set(auth(owner)).expect(200)).body as { signing_secret: string };
			await t.http().post(secretPath('/rotate')).set(auth(member)).expect(403);

			const rotated = (await t.http().post(secretPath('/rotate')).set(auth(owner)).expect(200)).body as { signing_secret: string };
			expect(rotated.signing_secret).toMatch(/^rdsec_/);
			expect(rotated.signing_secret).not.toBe(before.signing_secret);
			expect((await t.http().get(secretPath()).set(auth(owner)).expect(200)).body).toEqual(rotated);
		});

		it('키가 없는 예전 프로젝트는 처음 조회할 때 만든다', async () => {
			const legacy = await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'legacy-no-secret' } });
			const first = (await t.http().get(`${path(owner, legacy.id)}/signing-secret`).set(auth(owner)).expect(200)).body as { signing_secret: string };

			expect(first.signing_secret).toMatch(/^rdsec_/);
			expect((await t.http().get(`${path(owner, legacy.id)}/signing-secret`).set(auth(owner)).expect(200)).body).toEqual(first);
			await t.prisma.project.delete({ where: { id: legacy.id } });
		});

		it('타 조직 프로젝트는 404 project_not_found', async () => {
			expect(errorOf(await t.http().get(secretPath()).set(auth(outsider)).expect(404)).code).toBe('organization_not_found');
			const theirs = (await t.http().get(path(outsider)).set(auth(outsider)).expect(200)).body as ProjectPageDto;
			expect(errorOf(await t.http().get(`${path(owner, theirs.data[0]!.id)}/signing-secret`).set(auth(owner)).expect(404)).code).toBe('project_not_found');
		});
	});
});
