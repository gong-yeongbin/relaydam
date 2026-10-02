import { createHmac } from 'node:crypto';
import type { RejectedRequestPageDto } from '@/modules/rejected-requests/dto/rejected-request.dto';
import { newSlug } from '@/modules/sources/domain/slug';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('rejected-requests (e2e)', () => {
	let t: TestApp;
	let owner: LoggedIn;
	let member: LoggedIn;
	let outsider: LoggedIn;
	let projectId: number;
	let otherProjectId: number;
	// 서명 검증이 켜진 소스, 연결이 없는 소스
	let signed: { id: number; slug: string };
	let lonely: { id: number; slug: string };
	const SECRET = 'whsec_e2e';

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (project: number, query = '') => `/orgs/${owner.org_id}/projects/${project}/rejected-requests${query}`;
	const list = async (query = '', as = owner) => (await t.http().get(path(projectId, query)).set(auth(as)).expect(200)).body as RejectedRequestPageDto;
	const send = (slug: string, body: string) => t.http().post(`/in/${slug}`).set('Content-Type', 'application/json').send(body);

	beforeAll(async () => {
		t = await createTestApp();
		[owner, member, outsider] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		otherProjectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'blog' } })).id;

		lonely = await t.prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 'lonely' }, select: { id: true, slug: true } });
		signed = await t.prisma.source.create({ data: { project_id: projectId, slug: newSlug(), name: 'signed' }, select: { id: true, slug: true } });
		const destination = await t.prisma.destination.create({ data: { project_id: projectId, name: 'd', url: 'https://example.com/hook' } });
		await t.prisma.connection.create({ data: { source_id: signed.id, destination_id: destination.id } });
		await t
			.http()
			.patch(`/orgs/${owner.org_id}/projects/${projectId}/sources/${signed.id}`)
			.set(auth(owner))
			.send({ signing_secret: SECRET, signature_config: { header: 'X-Signature' } })
			.expect(200);

		// 실제 수신 경로로 거부를 만든다: 서명 불일치, 서명 헤더 없음, 연결 없음
		await send(signed.slug, '{"n":1}').set('X-Signature', 'deadbeef').expect(401);
		await send(signed.slug, '{"n":2}').expect(401);
		await send(lonely.slug, '{"n":3}').expect(409);
	});

	afterAll(() => t.close());

	it('거부된 요청을 최근 것부터 준다. 사유·헤더·크기가 있고 본문은 없다. member도 본다', async () => {
		const page = await list('', member);

		expect(page.next_cursor).toBeNull();
		expect(page.data.map((r) => [r.source_id, r.reason])).toEqual([
			[lonely.id, 'no_connection'],
			[signed.id, 'signature_missing'],
			[signed.id, 'signature_mismatch'],
		]);
		const mismatch = page.data[2]!;
		expect(mismatch).toMatchObject({ project_id: projectId, size: 7, headers: { 'x-signature': 'deadbeef', 'content-type': 'application/json' } });
		expect(typeof mismatch.id).toBe('string');
		expect(mismatch).not.toHaveProperty('body');
	});

	it('서명이 맞아 받은 요청은 목록에 없다', async () => {
		const body = '{"n":4}';
		await send(signed.slug, body).set('X-Signature', createHmac('sha256', SECRET).update(body).digest('hex')).expect(200);
		expect((await list()).data).toHaveLength(3);
	});

	it('source_id·reason으로 거른다. 모르는 reason은 400', async () => {
		expect((await list(`?source_id=${signed.id}`)).data.map((r) => r.reason)).toEqual(['signature_missing', 'signature_mismatch']);
		expect((await list('?reason=no_connection')).data.map((r) => r.source_id)).toEqual([lonely.id]);
		expect((await list(`?source_id=${lonely.id}&reason=signature_mismatch`)).data).toEqual([]);

		const bad = await t.http().get(path(projectId, '?reason=whatever')).set(auth(owner)).expect(400);
		expect(errorOf(bad)).toMatchObject({ code: 'validation_failed', details: [{ field: 'reason' }] });
	});

	it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
		const first = await list('?limit=2');
		const second = await list(`?limit=2&cursor=${first.next_cursor}`);

		expect([...first.data, ...second.data].map((r) => r.reason)).toEqual(['no_connection', 'signature_missing', 'signature_mismatch']);
		expect(second.next_cursor).toBeNull();
	});

	it('다른 project에서는 보이지 않고, 타 조직은 404, 토큰이 없으면 401', async () => {
		const other = (await t.http().get(path(otherProjectId)).set(auth(owner)).expect(200)).body as RejectedRequestPageDto;
		expect(other).toEqual({ data: [], next_cursor: null });

		await t.http().get(path(projectId)).set(auth(outsider)).expect(404);
		await t.http().get(path(projectId)).expect(401);
	});

	it('소스를 지워도 기록은 남고 source_id가 null이 된다', async () => {
		await t.http().delete(`/orgs/${owner.org_id}/projects/${projectId}/sources/${lonely.id}`).set(auth(owner)).expect(204);

		const page = await list('?reason=no_connection');
		expect(page.data.map((r) => r.source_id)).toEqual([null]);
	});
});
