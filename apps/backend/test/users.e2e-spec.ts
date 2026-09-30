import { randomUUID } from 'node:crypto';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import type { ErrorBody } from '@/common/http/http-exception.filter';
import { configureApp } from '@/common/configure-app';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { GOOGLE_ID_TOKEN_VERIFIER, type GoogleIdTokenVerifier, type GoogleProfile } from '@/modules/auth/ports/google-id-token.verifier';

// 실제 구글 대신 'google:<key>' 토큰을 프로필로 바꿔 준다
const profiles = new Map<string, GoogleProfile>();
const fakeGoogle: GoogleIdTokenVerifier = { verify: (idToken) => Promise.resolve(profiles.get(idToken) ?? null) };

describe('users (e2e)', () => {
	let app: NestFastifyApplication;
	let prisma: PrismaService;
	const emails: string[] = [];

	async function login(): Promise<{ token: string; profile: GoogleProfile }> {
		const key = randomUUID();
		const profile = { sub: `sub-${key}`, email: `${key}@test.relaydam.local`, email_verified: true, name: 'e2e', picture: 'https://example.com/a.png' };
		profiles.set(`google:${key}`, profile);
		emails.push(profile.email);
		const response = await request(app.getHttpServer()).post('/auth/google').send({ id_token: `google:${key}` }).expect(200);
		return { token: (response.body as { access_token: string }).access_token, profile };
	}

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GOOGLE_ID_TOKEN_VERIFIER).useValue(fakeGoogle).compile();

		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		configureApp(app);
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
		prisma = app.get(PrismaService);
	});

	afterAll(async () => {
		const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
		const userIds = users.map((u) => u.id);
		const orgs = await prisma.organization_member.findMany({ where: { user_id: { in: userIds } }, select: { organization_id: true } });
		await prisma.organization_member.deleteMany({ where: { user_id: { in: userIds } } });
		await prisma.organization.deleteMany({ where: { id: { in: orgs.map((o) => o.organization_id) } } });
		await prisma.user_identity.deleteMany({ where: { user_id: { in: userIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await app.close();
	});

	describe('GET /users/me', () => {
		it('로그인한 user를 돌려준다', async () => {
			const { token, profile } = await login();

			const response = await request(app.getHttpServer()).get('/users/me').set('Authorization', `Bearer ${token}`).expect(200);

			const user = await prisma.user.findUniqueOrThrow({ where: { email: profile.email } });
			expect(response.body).toEqual({
				id: user.id,
				email: profile.email,
				name: profile.name,
				avatar_url: profile.picture,
				created_at: user.created_at.toISOString(),
				updated_at: user.updated_at.toISOString(),
			});
		});

		it('토큰이 없으면 401 unauthenticated', async () => {
			const response = await request(app.getHttpServer()).get('/users/me').expect(401);
			expect((response.body as ErrorBody).code).toBe('unauthenticated');
		});
	});
});
