import type { MemberPageDto } from '@/modules/members/dto/list-members.dto';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('members (e2e)', () => {
	let t: TestApp;
	let owner: LoggedIn;
	let admin: LoggedIn;
	let m1: LoggedIn;
	let m2: LoggedIn;
	let outsider: LoggedIn;

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (userId?: number) => `/orgs/${owner.org_id}/members${userId ? `/${userId}` : ''}`;

	beforeAll(async () => {
		t = await createTestApp();
		[owner, admin, m1, m2, outsider] = [await t.login(), await t.login(), await t.login(), await t.login(), await t.login()];
		// owner의 개인 조직을 team으로 올리고 admin 1명, member 2명을 넣는다
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.createMany({
			data: [
				{ organization_id: owner.org_id, user_id: admin.user_id, role: 'admin' },
				{ organization_id: owner.org_id, user_id: m1.user_id, role: 'member' },
				{ organization_id: owner.org_id, user_id: m2.user_id, role: 'member' },
			],
		});
	});

	afterAll(() => t.close());

	it('GET — 유저 정보와 role, 커서로 두 페이지 순회 후 next_cursor null', async () => {
		const first = (await t.http().get(`${path()}?limit=3`).set(auth(m1)).expect(200)).body as MemberPageDto;
		const second = (await t.http().get(`${path()}?limit=3&cursor=${first.next_cursor}`).set(auth(m1)).expect(200)).body as MemberPageDto;

		expect(second.next_cursor).toBeNull();
		const all = [...first.data, ...second.data];
		expect(all.map((m) => m.user_id).sort()).toEqual([owner, admin, m1, m2].map((u) => u.user_id).sort());
		expect(all.find((m) => m.user_id === admin.user_id)).toMatchObject({ role: 'admin', user: { email: admin.profile.email } });
	});

	it('GET — 타 조직은 404', async () => {
		const response = await t.http().get(path()).set(auth(outsider)).expect(404);
		expect(errorOf(response).code).toBe('organization_not_found');
	});

	it('PATCH — admin은 member를 admin으로 바꾸고, member는 403, owner 대상 403, owner로는 400', async () => {
		const updated = await t.http().patch(path(m2.user_id)).set(auth(admin)).send({ role: 'admin' }).expect(200);
		expect(updated.body).toMatchObject({ user_id: m2.user_id, role: 'admin' });
		await t.http().patch(path(m2.user_id)).set(auth(admin)).send({ role: 'member' }).expect(200);

		await t.http().patch(path(m2.user_id)).set(auth(m1)).send({ role: 'admin' }).expect(403);
		await t.http().patch(path(owner.user_id)).set(auth(admin)).send({ role: 'member' }).expect(403);
		const invalid = await t.http().patch(path(m2.user_id)).set(auth(owner)).send({ role: 'owner' }).expect(400);
		expect(errorOf(invalid).code).toBe('validation_failed');
	});

	it('DELETE — member가 남을 내보내면 403, owner는 나갈 수 없다(403)', async () => {
		await t.http().delete(path(m2.user_id)).set(auth(m1)).expect(403);
		await t.http().delete(path(owner.user_id)).set(auth(owner)).expect(403);
	});

	it('DELETE — member는 스스로 나가고, admin은 남을 내보낸다(204)', async () => {
		await t.http().delete(path(m1.user_id)).set(auth(m1)).expect(204);
		await t.http().delete(path(m2.user_id)).set(auth(admin)).expect(204);

		const left = await t.prisma.organization_member.findMany({ where: { organization_id: owner.org_id } });
		expect(left.map((m) => m.user_id).sort()).toEqual([owner.user_id, admin.user_id].sort());
		// 나간 조직에는 더 이상 접근할 수 없다
		await t.http().get(path()).set(auth(m1)).expect(404);
	});

	it('멤버 수가 상한을 넘는 조직(결제 실패로 free)은 owner 외 멤버 403 plan_limit', async () => {
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'free' } });

		const locked = await t.http().get(path()).set(auth(admin)).expect(403);
		expect(errorOf(locked).code).toBe('plan_limit');
		await t.http().get(path()).set(auth(owner)).expect(200);
		// owner가 상한 이하로 줄이면 복구된다 — 여기선 멤버 2명이라 owner가 admin을 내보낸다
		await t.http().delete(path(admin.user_id)).set(auth(owner)).expect(204);
	});
});
