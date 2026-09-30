import type { OrgPageDto } from '@/modules/orgs/dto/list-orgs.dto';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('orgs (e2e)', () => {
	let t: TestApp;
	let alice: LoggedIn;
	let bob: LoggedIn;
	let carol: LoggedIn;

	beforeAll(async () => {
		t = await createTestApp();
		[alice, bob, carol] = [await t.login(), await t.login(), await t.login()];
		// alice는 개인 조직(owner) + bob 조직(admin) + carol 조직(member)
		await t.prisma.organization_member.createMany({
			data: [
				{ organization_id: bob.org_id, user_id: alice.user_id, role: 'admin' },
				{ organization_id: carol.org_id, user_id: alice.user_id, role: 'member' },
			],
		});
	});

	afterAll(() => t.close());

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });

	describe('GET /orgs', () => {
		it('소속 조직만 role과 함께, 커서로 두 페이지 순회 후 next_cursor null', async () => {
			const first = (await t.http().get('/orgs?limit=2').set(auth(alice)).expect(200)).body as OrgPageDto;
			expect(first.data).toHaveLength(2);
			expect(first.next_cursor).not.toBeNull();

			const second = (await t.http().get(`/orgs?limit=2&cursor=${first.next_cursor}`).set(auth(alice)).expect(200)).body as OrgPageDto;
			expect(second.next_cursor).toBeNull();

			const roles = Object.fromEntries([...first.data, ...second.data].map((o) => [o.id, o.role]));
			expect(roles).toEqual({ [alice.org_id]: 'owner', [bob.org_id]: 'admin', [carol.org_id]: 'member' });
		});

		it('limit이 범위를 벗어나면 400 validation_failed', async () => {
			const response = await t.http().get('/orgs?limit=201').set(auth(alice)).expect(400);
			expect(errorOf(response).code).toBe('validation_failed');
		});
	});

	describe('GET /orgs/:orgId', () => {
		it('소속 조직은 행을, 타 조직은 404', async () => {
			const own = await t.http().get(`/orgs/${carol.org_id}`).set(auth(alice)).expect(200);
			expect(own.body).toMatchObject({ id: carol.org_id, plan: 'free' });

			const other = await t.http().get(`/orgs/${alice.org_id}`).set(auth(bob)).expect(404);
			expect(errorOf(other).code).toBe('organization_not_found');
		});
	});

	describe('PATCH /orgs/:orgId', () => {
		it('admin 이상은 이름을 바꾸고, member는 403', async () => {
			const updated = await t.http().patch(`/orgs/${bob.org_id}`).set(auth(alice)).send({ name: '결제팀' }).expect(200);
			expect(updated.body).toMatchObject({ id: bob.org_id, name: '결제팀' });

			const forbidden = await t.http().patch(`/orgs/${carol.org_id}`).set(auth(alice)).send({ name: '결제팀' }).expect(403);
			expect(errorOf(forbidden).code).toBe('forbidden');
		});

		it('빈 이름·모르는 필드는 400', async () => {
			await t.http().patch(`/orgs/${alice.org_id}`).set(auth(alice)).send({ name: '' }).expect(400);
			await t.http().patch(`/orgs/${alice.org_id}`).set(auth(alice)).send({ plan: 'team_plus' }).expect(400);
		});
	});
});
