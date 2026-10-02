import { ConfigService } from '@nestjs/config';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { newSlug } from '../domain/slug';
import type { CreateCheck } from '../ports/source.repository';
import { PrismaSourceRepository } from './prisma-source.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('PrismaSourceRepository (통합)', () => {
	const config = new ConfigService({ DATABASE_URL: process.env.DATABASE_URL, ENCRYPTION_KEY: process.env.ENCRYPTION_KEY });
	const prisma = new PrismaService(config);
	const cipher = new CipherService(config);
	const sources = new PrismaSourceRepository(prisma, cipher);
	const allow: CreateCheck = () => undefined;
	const CONFIG = { header: 'x-signature', encoding: 'hex' as const, secret_encoding: 'utf8' as const, signed_payload: '{body}', tolerance_sec: 300 };
	const open = (name: string) => ({ name, slug: newSlug(), signing_secret: null, signature_config: null });
	let orgId: number;
	let projectId: number;
	let otherProjectId: number;

	beforeAll(async () => {
		orgId = (await prisma.organization.create({ data: { name: 'source 테스트', plan: 'team' } })).id;
		projectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'a' } })).id;
		otherProjectId = (await prisma.project.create({ data: { organization_id: orgId, name: 'b' } })).id;
	});

	afterAll(async () => {
		// source는 project를 지우면 같이 지워진다(FK cascade)
		await prisma.project.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.deleteMany({ where: { id: orgId } });
		await prisma.$disconnect();
	});

	it('create — 잠근 상태의 plan·그 project의 개수를 check에 넘기고, check가 던지면 만들지 않는다', async () => {
		const seen: unknown[] = [];
		const created = await sources.create(projectId, open('first'), (state) => void seen.push(state));
		expect(created).toMatchObject({ project_id: projectId, name: 'first', signature_config: null });
		expect(created).not.toHaveProperty('signing_secret_enc');
		expect(seen).toEqual([{ plan: 'team', count: 0 }]);

		await expect(
			sources.create(projectId, open('rejected'), () => {
				throw new Error('limit');
			}),
		).rejects.toThrow('limit');
		expect(await prisma.source.count({ where: { project_id: projectId, name: 'rejected' } })).toBe(0);
	});

	it('create — 동시에 들어와도 잠금으로 줄 서서 상한(1)을 넘지 않는다', async () => {
		// 커넥션을 미리 열어 둔다. 근거는 context-notes.md "상한 검사는 조직 행 잠금 안에서"
		await Promise.all(Array.from({ length: 10 }, () => prisma.$queryRaw`SELECT pg_sleep(0.05)::text`));
		const limitOne: CreateCheck = ({ count }) => {
			if (count >= 1) throw new Error('limit');
		};
		const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => sources.create(otherProjectId, open(`r${i}`), limitOne)));

		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(await prisma.source.count({ where: { project_id: otherProjectId } })).toBe(1);
	});

	it('시크릿은 암호화해 저장하고 읽을 때 내주지 않는다. 교체·제거도 된다', async () => {
		const created = await sources.create(projectId, { name: 'signed', slug: newSlug(), signing_secret: 'whsec_plain', signature_config: CONFIG }, allow);
		expect(created.signature_config).toEqual(CONFIG);
		const stored = async () => (await prisma.source.findUniqueOrThrow({ where: { id: created.id } })).signing_secret_enc;

		const first = await stored();
		expect(first).not.toContain('whsec_plain');
		expect(cipher.decrypt(first!)).toBe('whsec_plain');

		// 이름만 바꾸면 시크릿·설정은 그대로다
		expect(await sources.update(projectId, created.id, { name: 'renamed' })).toMatchObject({ name: 'renamed', signature_config: CONFIG });
		expect(await stored()).toBe(first);

		await sources.update(projectId, created.id, { signing_secret: 'whsec_new' });
		expect(cipher.decrypt((await stored())!)).toBe('whsec_new');

		// 둘 다 비우면 DB NULL이 들어가 CHECK를 통과한다
		expect(await sources.update(projectId, created.id, { signing_secret: null, signature_config: null })).toMatchObject({ signature_config: null });
		expect(await stored()).toBeNull();
	});

	it('시크릿과 설정 중 하나만 있으면 DB CHECK가 막는다', async () => {
		await expect(sources.create(projectId, { ...open('half'), signing_secret: 'only-secret' }, allow)).rejects.toThrow();
		expect(await prisma.source.count({ where: { project_id: projectId, name: 'half' } })).toBe(0);
	});

	it('list — id 내림차순, cursor보다 작은 것부터. 시크릿 컬럼은 없다', async () => {
		await sources.create(projectId, open('second'), allow);
		const all = await sources.list(projectId, null, 100);
		expect(all.length).toBeGreaterThanOrEqual(2);
		expect(all.map((s) => s.id)).toEqual([...all.map((s) => s.id)].sort((x, y) => y - x));
		expect(all.every((s) => !('signing_secret_enc' in s))).toBe(true);
		expect((await sources.list(projectId, all[0]!.id, 100)).map((s) => s.id)).toEqual(all.slice(1).map((s) => s.id));
	});

	it('find·update·remove — 다른 project의 id는 null/false', async () => {
		const s = await sources.create(projectId, open('mine'), allow);

		expect(await sources.find(otherProjectId, s.id)).toBeNull();
		expect(await sources.update(otherProjectId, s.id, { name: 'hacked' })).toBeNull();
		expect(await sources.remove(otherProjectId, s.id)).toBe(false);

		const slug = newSlug();
		expect(await sources.update(projectId, s.id, { slug })).toMatchObject({ id: s.id, name: 'mine', slug });
		expect(await sources.remove(projectId, s.id)).toBe(true);
		expect(await sources.find(projectId, s.id)).toBeNull();
	});
});
