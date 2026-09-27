import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PrismaAccountRepository } from './prisma-account.repository';
import { PrismaMembershipRepository } from './prisma-membership.repository';

// adapter는 docker compose의 postgres 위에서 통합으로 본다(`pnpm docker:up && pnpm db:deploy` 선행).
describe('Prisma auth 저장소 (통합)', () => {
	const prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
	const accounts = new PrismaAccountRepository(prisma);
	const memberships = new PrismaMembershipRepository(prisma);
	const createdUserIds: number[] = [];

	function profile() {
		const key = randomUUID();
		return { sub: `sub-${key}`, email: `${key}@test.relaydam.local`, email_verified: true, name: '테스트', picture: null };
	}

	afterAll(async () => {
		const orgs = await prisma.organization_member.findMany({ where: { user_id: { in: createdUserIds } }, select: { organization_id: true } });
		await prisma.organization_member.deleteMany({ where: { user_id: { in: createdUserIds } } });
		await prisma.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.organization_id) } } });
		await prisma.user_identity.deleteMany({ where: { user_id: { in: createdUserIds } } });
		await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
		await prisma.$disconnect();
	});

	it('가입하면 user·google identity·개인 free 조직·owner 멤버가 생긴다', async () => {
		const p = profile();
		const userId = await accounts.signUpWithGoogle(p);
		createdUserIds.push(userId);

		expect(await accounts.findUserIdByGoogleSub(p.sub)).toBe(userId);
		expect(await accounts.findUserIdByEmail(p.email)).toBe(userId);
		const member = await prisma.organization_member.findFirstOrThrow({ where: { user_id: userId }, include: { organization: true } });
		expect(member.role).toBe('owner');
		expect(member.organization).toMatchObject({ plan: 'free', name: '테스트의 조직' });
		expect(await memberships.findRole(member.organization_id, userId)).toBe('owner');
	});

	it('없는 sub·이메일·membership은 null', async () => {
		expect(await accounts.findUserIdByGoogleSub('sub-none')).toBeNull();
		expect(await accounts.findUserIdByEmail('none@test.relaydam.local')).toBeNull();
		expect(await memberships.findRole(2147483647, 2147483647)).toBeNull();
	});

	it('기존 유저에 구글 identity를 연결한다', async () => {
		const userId = await accounts.signUpWithGoogle(profile());
		createdUserIds.push(userId);

		await accounts.linkGoogleIdentity(userId, 'sub-linked-' + userId);

		expect(await accounts.findUserIdByGoogleSub('sub-linked-' + userId)).toBe(userId);
	});
});
