import type { ConnectionDto, ConnectionPageDto } from '@/modules/connections/dto/connection.dto';
import { newSlug } from '@/modules/sources/domain/slug';
import { createTestApp, errorOf, type LoggedIn, type TestApp } from './support';

describe('connections (e2e)', () => {
	let t: TestApp;
	let owner: LoggedIn;
	let member: LoggedIn;
	let outsider: LoggedIn;
	let projectId: number;
	let otherProjectId: number;
	// [이 project의 것 셋, 같은 조직 다른 project의 것 하나]
	let sources: number[];
	let destinations: number[];

	const auth = (who: LoggedIn) => ({ Authorization: `Bearer ${who.token}` });
	const path = (project: number, connectionId?: number) => `/orgs/${owner.org_id}/projects/${project}/connections${connectionId ? `/${connectionId}` : ''}`;
	const connect = (source_id: number, destination_id: number, as = owner, project = projectId) => t.http().post(path(project)).set(auth(as)).send({ source_id, destination_id });
	const source = async (project: number) => (await t.prisma.source.create({ data: { project_id: project, slug: newSlug(), name: 's' } })).id;
	const destination = async (project: number) => (await t.prisma.destination.create({ data: { project_id: project, name: 'd', url: 'https://example.com' } })).id;

	beforeAll(async () => {
		t = await createTestApp();
		[owner, member, outsider] = [await t.login(), await t.login(), await t.login()];
		await t.prisma.organization.update({ where: { id: owner.org_id }, data: { plan: 'team' } });
		await t.prisma.organization_member.create({ data: { organization_id: owner.org_id, user_id: member.user_id, role: 'member' } });
		projectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'shop' } })).id;
		otherProjectId = (await t.prisma.project.create({ data: { organization_id: owner.org_id, name: 'blog' } })).id;
		sources = [await source(projectId), await source(projectId), await source(projectId), await source(otherProjectId)];
		destinations = [await destination(projectId), await destination(projectId), await destination(projectId), await destination(otherProjectId)];
	});

	afterAll(() => t.close());

	it('member가 소스와 목적지를 잇고·조회하고·끊는다. 끊어도 소스와 목적지는 남는다', async () => {
		const created = (await connect(sources[0]!, destinations[0]!, member).expect(201)).body as ConnectionDto;
		expect(created).toMatchObject({ source_id: sources[0], destination_id: destinations[0] });

		expect((await t.http().get(path(projectId, created.id)).set(auth(member)).expect(200)).body).toMatchObject({ id: created.id });
		await t.http().delete(path(projectId, created.id)).set(auth(member)).expect(204);

		const gone = await t.http().get(path(projectId, created.id)).set(auth(member)).expect(404);
		expect(errorOf(gone).code).toBe('connection_not_found');
		expect(await t.prisma.source.count({ where: { id: sources[0] } })).toBe(1);
		expect(await t.prisma.destination.count({ where: { id: destinations[0] } })).toBe(1);
	});

	it('다른 project의 소스·목적지로는 만들 수 없다 — 404', async () => {
		const foreignSource = await connect(sources[3]!, destinations[0]!).expect(404);
		expect(errorOf(foreignSource).code).toBe('source_not_found');
		const foreignDestination = await connect(sources[0]!, destinations[3]!).expect(404);
		expect(errorOf(foreignDestination).code).toBe('destination_not_found');
		expect(await t.prisma.connection.count({ where: { source: { project_id: projectId } } })).toBe(0);
	});

	it('같은 쌍을 두 번 이으면 409 connection_conflict, id가 숫자가 아니면 400', async () => {
		await connect(sources[0]!, destinations[0]!).expect(201);
		const dup = await connect(sources[0]!, destinations[0]!).expect(409);
		expect(errorOf(dup).code).toBe('connection_conflict');

		const bad = await t.http().post(path(projectId)).set(auth(owner)).send({ source_id: 'x' }).expect(400);
		expect(errorOf(bad).code).toBe('validation_failed');
	});

	it('소스 하나에 목적지 여러 개를 잇고, source_id·destination_id로 걸러 본다', async () => {
		await connect(sources[1]!, destinations[0]!).expect(201);
		await connect(sources[1]!, destinations[1]!).expect(201);
		const list = async (query: string) => ((await t.http().get(`${path(projectId)}?${query}`).set(auth(owner)).expect(200)).body as ConnectionPageDto).data;

		expect((await list(`source_id=${sources[1]}`)).map((c) => c.destination_id).sort()).toEqual([destinations[0], destinations[1]].sort());
		expect((await list(`destination_id=${destinations[0]}`)).map((c) => c.source_id).sort()).toEqual([sources[0], sources[1]].sort());
		expect(await list(`source_id=${sources[3]}`)).toEqual([]);
	});

	it('소스를 지우면 그 소스의 연결이 같이 지워진다', async () => {
		const created = (await connect(sources[2]!, destinations[2]!).expect(201)).body as ConnectionDto;
		await t.http().delete(`/orgs/${owner.org_id}/projects/${projectId}/sources/${sources[2]}`).set(auth(owner)).expect(204);
		await t.http().get(path(projectId, created.id)).set(auth(owner)).expect(404);
	});

	it('같은 조직의 다른 project에서는 404 connection_not_found, 타 조직·토큰 없음은 404·401', async () => {
		const page = (await t.http().get(path(projectId)).set(auth(owner)).expect(200)).body as ConnectionPageDto;
		const id = page.data[0]!.id;

		expect(errorOf(await t.http().get(path(otherProjectId, id)).set(auth(owner)).expect(404)).code).toBe('connection_not_found');
		expect(errorOf(await t.http().delete(path(otherProjectId, id)).set(auth(owner)).expect(404)).code).toBe('connection_not_found');
		await t.http().get(path(projectId)).set(auth(outsider)).expect(404);
		await t.http().get(path(projectId)).expect(401);
	});

	it('목록 커서로 두 페이지 순회 후 next_cursor null', async () => {
		const all = (await t.http().get(path(projectId)).set(auth(member)).expect(200)).body as ConnectionPageDto;
		expect(all.data).toHaveLength(3);

		const first = (await t.http().get(`${path(projectId)}?limit=2`).set(auth(member)).expect(200)).body as ConnectionPageDto;
		const second = (await t.http().get(`${path(projectId)}?limit=2&cursor=${first.next_cursor}`).set(auth(member)).expect(200)).body as ConnectionPageDto;
		expect([...first.data, ...second.data].map((c) => c.id)).toEqual(all.data.map((c) => c.id));
		expect(second.next_cursor).toBeNull();
	});

	describe('재시도 설정과 일시 정지', () => {
		let id: number;
		const item = (connectionId: number, suffix = '') => `${path(projectId, connectionId)}${suffix}`;

		beforeAll(async () => {
			const fresh = [await source(projectId), await destination(projectId)] as const;
			id = ((await connect(fresh[0], fresh[1]).expect(201)).body as ConnectionDto).id;
		});

		it('재시도 설정을 안 보내면 2배씩·5분·9회로 만든다', async () => {
			expect((await t.http().get(item(id)).set(auth(owner)).expect(200)).body).toMatchObject({
				retry_strategy: 'exponential',
				retry_interval_ms: 300_000,
				retry_count: 9,
				paused_at: null,
			});
		});

		it('만들 때 재시도 설정을 줄 수 있다', async () => {
			const created = await t
				.http()
				.post(path(projectId))
				.set(auth(owner))
				.send({ source_id: await source(projectId), destination_id: await destination(projectId), retry_strategy: 'linear', retry_interval_ms: 3_600_000, retry_count: 5 })
				.expect(201);
			expect(created.body).toMatchObject({ retry_strategy: 'linear', retry_interval_ms: 3_600_000, retry_count: 5 });
		});

		it('member가 재시도 설정을 바꾼다. 보낸 필드만 바뀐다', async () => {
			const patch = (body: object) => t.http().patch(item(id)).set(auth(member)).send(body);

			expect((await patch({ retry_count: 0 }).expect(200)).body).toMatchObject({ retry_strategy: 'exponential', retry_interval_ms: 300_000, retry_count: 0 });
			expect((await patch({ retry_strategy: 'linear', retry_interval_ms: 60_000 }).expect(200)).body).toMatchObject({
				retry_strategy: 'linear',
				retry_interval_ms: 60_000,
				retry_count: 0,
			});
		});

		it.each([
			['모르는 방식', { retry_strategy: 'random' }, 'retry_strategy'],
			['간격이 1초 미만', { retry_interval_ms: 999 }, 'retry_interval_ms'],
			['간격이 24시간 초과', { retry_interval_ms: 86_400_001 }, 'retry_interval_ms'],
			['횟수가 50 초과', { retry_count: 51 }, 'retry_count'],
			['횟수가 음수', { retry_count: -1 }, 'retry_count'],
			['소스·목적지는 바꿀 수 없다', { source_id: 1 }, 'source_id'],
		])('400 validation_failed — %s', async (_name, body, field) => {
			const error = errorOf(await t.http().patch(item(id)).set(auth(owner)).send(body).expect(400));
			expect(error.code).toBe('validation_failed');
			expect(new Set(error.details?.map((d) => d.field))).toEqual(new Set([field]));
		});

		it('일시 정지하면 멈춘 시각이 남고, 다시 멈춰도 그대로이고, 풀면 비워진다', async () => {
			const paused = (await t.http().post(item(id, '/pause')).set(auth(member)).expect(200)).body as ConnectionDto;
			expect(paused.paused_at).not.toBeNull();

			const again = (await t.http().post(item(id, '/pause')).set(auth(member)).expect(200)).body as ConnectionDto;
			expect(again.paused_at).toBe(paused.paused_at);

			expect((await t.http().post(item(id, '/unpause')).set(auth(member)).expect(200)).body).toMatchObject({ paused_at: null });
		});

		it('다른 project에서는 수정·일시 정지·재개가 404 connection_not_found', async () => {
			for (const request of [
				() => t.http().patch(item(id).replace(`/projects/${projectId}/`, `/projects/${otherProjectId}/`)).send({ retry_count: 1 }),
				() => t.http().post(item(id, '/pause').replace(`/projects/${projectId}/`, `/projects/${otherProjectId}/`)),
				() => t.http().post(item(id, '/unpause').replace(`/projects/${projectId}/`, `/projects/${otherProjectId}/`)),
			]) {
				expect(errorOf(await request().set(auth(owner)).expect(404)).code).toBe('connection_not_found');
			}
		});
	});
});
