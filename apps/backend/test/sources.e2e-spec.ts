import type { SourceDto, SourcePageDto } from '@/modules/sources/dto/get-source.dto';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('sources (e2e)', () => {
	let t: TestApp;
	let owner: LoggedIn;
	let member: LoggedIn;
	let free: LoggedIn;
	let projectId: number;
	let otherProjectId: number;
	let freeProjectId: number;

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (who: LoggedIn, project: number, sourceId?: number | string) => `/orgs/${who.org_id}/projects/${project}/sources${sourceId ? `/${sourceId}` : ''}`;
	// org는 경로의 조직, as는 호출하는 사람
	const create = (body: object, opts: { org?: LoggedIn; as?: LoggedIn; project?: number } = {}) => {
		const org = opts.org ?? owner;
		return t
			.http()
			.post(path(org, opts.project ?? projectId))
			.set(auth(opts.as ?? org))
			.send(body);
	};
	const CONFIG = { header: 'X-Hub-Signature-256', prefix: 'sha256=', event_id_header: 'X-GitHub-Delivery' };

	beforeAll(async () => {
		t = await createTestApp();
		[owner, member, free] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		otherProjectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'blog' } })).id;
		freeProjectId = (await t.prisma.project.create({ data: { organization_id: free.org_id, name: 'trial' } })).id;
	});

	afterAll(() => t.close());

	it('생성 응답에 서버가 만든 20자 slug가 있고, 재발급하면 바뀐다', async () => {
		const created = (await create({ name: 'toss' }).expect(201)).body as SourceDto;
		expect(created).toMatchObject({ project_id: projectId, name: 'toss', signature_config: null });
		expect(created.slug).toMatch(/^[a-z0-9]{20}$/);

		const rotated = (await t.http().post(`${path(owner, projectId, created.id)}/rotate-slug`).set(auth(owner)).expect(200)).body as SourceDto;
		expect(rotated).toMatchObject({ id: created.id, name: 'toss' });
		expect(rotated.slug).toMatch(/^[a-z0-9]{20}$/);
		expect(rotated.slug).not.toBe(created.slug);

		// slug는 보낼 수 없다(모르는 필드)
		await create({ name: 'custom', slug: 'my-own-slug' }).expect(400);
	});

	it('응답에 시크릿이 없고 DB에는 암호문으로 저장된다. 설정은 기본값이 채워지고 헤더 이름은 소문자가 된다', async () => {
		const response = await create({ name: 'github', signing_secret: 'whsec_plain_value', signature_config: CONFIG }).expect(201);
		const created = response.body as SourceDto;
		expect(response.text).not.toContain('whsec_plain_value');
		expect(created).not.toHaveProperty('signing_secret');
		expect(created).not.toHaveProperty('signing_secret_enc');
		expect(created.signature_config).toEqual({
			header: 'x-hub-signature-256',
			encoding: 'hex',
			secret_encoding: 'utf8',
			prefix: 'sha256=',
			signed_payload: '{body}',
			tolerance_sec: 300,
			event_id_header: 'x-github-delivery',
		});

		const row = await t.prisma.source.findUniqueOrThrow({ where: { id: created.id } });
		expect(row.signing_secret_enc).toBeTruthy();
		expect(row.signing_secret_enc).not.toContain('whsec_plain_value');

		const got = await t.http().get(path(owner, projectId, created.id)).set(auth(owner)).expect(200);
		const listed = await t.http().get(path(owner, projectId)).set(auth(owner)).expect(200);
		for (const text of [got.text, listed.text]) expect(text).not.toMatch(/signing_secret|whsec_plain_value/);
	});

	it('시크릿과 설정 중 하나만 보내면 400 validation_failed. 설정 모양이 틀려도 400', async () => {
		const onlySecret = await create({ name: 'a', signing_secret: 's' }).expect(400);
		expect(errorOf(onlySecret)).toMatchObject({ code: 'validation_failed', details: [{ field: 'signature_config' }] });
		const onlyConfig = await create({ name: 'a', signature_config: CONFIG }).expect(400);
		expect(errorOf(onlyConfig)).toMatchObject({ code: 'validation_failed', details: [{ field: 'signing_secret' }] });

		const badConfig = await create({ name: 'a', signing_secret: 's', signature_config: { header: 'x-sig', encoding: 'base32' } }).expect(400);
		expect(errorOf(badConfig)).toMatchObject({ code: 'validation_failed', details: [{ field: 'signature_config' }] });
		await create({ name: 'a', signing_secret: 's', signature_config: { preset: 'github' } }).expect(400);
	});

	it('수정 — 이름만, 시크릿 교체, 검증 끄기. 하나만 남기면 400', async () => {
		const created = (await create({ name: 'portone', signing_secret: 'old', signature_config: CONFIG }).expect(201)).body as SourceDto;
		const patch = (body: object) => t.http().patch(path(owner, projectId, created.id)).set(auth(owner)).send(body);
		const secret = async () => (await t.prisma.source.findUniqueOrThrow({ where: { id: created.id } })).signing_secret_enc;
		const before = await secret();

		expect((await patch({ name: 'portone v2' }).expect(200)).body).toMatchObject({ name: 'portone v2', signature_config: created.signature_config });
		expect(await secret()).toBe(before);

		await patch({ signing_secret: 'new' }).expect(200);
		expect(await secret()).not.toBe(before);

		await patch({ signature_config: null }).expect(400);
		expect((await patch({ signing_secret: null, signature_config: null }).expect(200)).body).toMatchObject({ name: 'portone v2', signature_config: null });
		expect(await secret()).toBeNull();
	});

	it('member도 만들고·바꾸고·지운다. 지운 뒤에는 404 source_not_found', async () => {
		const created = (await create({ name: 'by member' }, { as: member }).expect(201)).body as SourceDto;
		await t.http().patch(path(owner, projectId, created.id)).set(auth(member)).send({ name: 'renamed' }).expect(200);
		await t.http().delete(path(owner, projectId, created.id)).set(auth(member)).expect(204);

		const response = await t.http().get(path(owner, projectId, created.id)).set(auth(member)).expect(404);
		expect(errorOf(response).code).toBe('source_not_found');
	});

	it('free 조직은 project당 3개까지, 4번째는 403 plan_limit', async () => {
		for (const name of ['a', 'b', 'c']) await create({ name }, { org: free, project: freeProjectId }).expect(201);
		const response = await create({ name: 'd' }, { org: free, project: freeProjectId }).expect(403);
		expect(errorOf(response).code).toBe('plan_limit');
	});

	it('같은 조직의 다른 project에서는 404 source_not_found, 타 조직 project는 404 project_not_found', async () => {
		const created = (await create({ name: 'scoped' }).expect(201)).body as SourceDto;

		// 요청은 하나씩 만든다. supertest 요청을 미리 여러 개 만들어 두면 먼저 끝난 요청이 서버를 닫는다
		for (const request of [
			() => t.http().get(path(owner, otherProjectId, created.id)),
			() => t.http().patch(path(owner, otherProjectId, created.id)).send({ name: 'x' }),
			() => t.http().post(`${path(owner, otherProjectId, created.id)}/rotate-slug`),
			() => t.http().delete(path(owner, otherProjectId, created.id)),
		]) {
			expect(errorOf(await request().set(auth(owner)).expect(404)).code).toBe('source_not_found');
		}

		const foreign = await t.http().get(path(owner, freeProjectId)).set(auth(owner)).expect(404);
		expect(errorOf(foreign).code).toBe('project_not_found');
		await t.http().get(path(free, projectId)).set(auth(free)).expect(404);
	});

	it('토큰이 없으면 401', async () => {
		await t.http().get(path(owner, projectId)).expect(401);
	});

	it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
		for (const name of ['p1', 'p2', 'p3']) await create({ name }, { project: otherProjectId }).expect(201);
		const first = (await t.http().get(`${path(owner, otherProjectId)}?limit=2`).set(auth(member)).expect(200)).body as SourcePageDto;
		const second = (await t.http().get(`${path(owner, otherProjectId)}?limit=2&cursor=${first.next_cursor}`).set(auth(member)).expect(200)).body as SourcePageDto;
		expect([...first.data, ...second.data].map((s) => s.name)).toEqual(['p3', 'p2', 'p1']);
		expect(second.next_cursor).toBeNull();
	});
});
