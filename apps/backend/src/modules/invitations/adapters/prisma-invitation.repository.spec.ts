import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PrismaInvitationRepository } from './prisma-invitation.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('PrismaInvitationRepository (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const invitations = new PrismaInvitationRepository(prisma);
	const now = new Date();
	const later = new Date(now.getTime() + 60_000);
	let orgId: number;
	let ownerId: number;
	let ownerEmail: string;
	let inviteeId: number;
	const email = () => `${randomUUID()}@test.relaydam.local`;
	const hash = () => randomUUID().replaceAll('-', '').padEnd(64, '0');

	beforeAll(async () => {
		ownerEmail = email();
		ownerId = (await prisma.user.create({ data: { email: ownerEmail, name: '초대한 사람' } })).id;
		inviteeId = (await prisma.user.create({ data: { email: email(), name: '초대받은 사람' } })).id;
		orgId = (await prisma.organization.create({ data: { name: '초대 테스트', plan: 'team', members: { create: { user_id: ownerId, role: 'owner' } } } })).id;
	});

	afterAll(async () => {
		await prisma.invitation.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization_member.deleteMany({ where: { organization_id: orgId } });
		await prisma.organization.delete({ where: { id: orgId } });
		await prisma.user.deleteMany({ where: { id: { in: [ownerId, inviteeId] } } });
		await prisma.$disconnect();
	});

	const base = () => ({ organization_id: orgId, role: 'member' as const, token_hash: hash(), expires_at: later, invited_by_user_id: ownerId });

	it('upsert — 같은 조직·이메일이면 행 하나를 교체하고, token_hash는 돌려주지 않는다', async () => {
		const address = email();
		const first = await invitations.upsert({ ...base(), email: address });
		const second = await invitations.upsert({ ...base(), email: address, role: 'admin' });

		expect(second).toMatchObject({ id: first.id, email: address, role: 'admin' });
		expect(second).not.toHaveProperty('token_hash');
	});

	it('inviteContext — 멤버 수, 같은 이메일·만료된 것을 뺀 대기 수, 이미 멤버 여부(대소문자 무시), 초대한 사람 이름', async () => {
		const target = email();
		await invitations.upsert({ ...base(), email: target });
		await invitations.upsert({ ...base(), email: email(), expires_at: new Date(now.getTime() - 1) });
		const before = await prisma.invitation.count({ where: { organization_id: orgId, email: { not: target }, expires_at: { gt: now } } });

		expect(await invitations.inviteContext(orgId, target, ownerId, now)).toEqual({
			org_name: '초대 테스트',
			plan: 'team',
			member_count: 1,
			pending_count: before,
			already_member: false,
			inviter_name: '초대한 사람',
		});
		expect((await invitations.inviteContext(orgId, ownerEmail.toUpperCase(), ownerId, now)).already_member).toBe(true);
	});

	it('list·remove — id 내림차순, 타 조직 id는 지우지 않는다', async () => {
		const created = await invitations.upsert({ ...base(), email: email() });
		const listed = await invitations.list(orgId, null, 100);
		expect(listed[0]!.id).toBe(created.id);
		expect(listed.every((r) => !('token_hash' in r))).toBe(true);
		expect((await invitations.list(orgId, created.id, 100)).every((r) => r.id < created.id)).toBe(true);

		expect(await invitations.remove(orgId + 1_000_000, created.id)).toBe(false);
		expect(await invitations.remove(orgId, created.id)).toBe(true);
	});

	it('findByTokenHash·findUserEmail·accept — 멤버를 만들고 초대를 지운다, 이미 멤버면 기존 행', async () => {
		const token_hash = hash();
		await invitations.upsert({ ...base(), email: email(), token_hash, role: 'admin' });
		const found = (await invitations.findByTokenHash(token_hash))!;

		expect(await invitations.findUserEmail(ownerId)).toBe(ownerEmail);
		expect(await invitations.findUserEmail(2147483647)).toBeNull();
		expect(await invitations.accept(found, inviteeId)).toMatchObject({ organization_id: orgId, user_id: inviteeId, role: 'admin' });
		expect(await invitations.findByTokenHash(token_hash)).toBeNull();

		const again = hash();
		await invitations.upsert({ ...base(), email: email(), token_hash: again });
		expect(await invitations.accept((await invitations.findByTokenHash(again))!, inviteeId)).toMatchObject({ role: 'admin' });
	});
});
