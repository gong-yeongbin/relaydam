import { createTestApp, errorOf, type TestApp } from './support';

describe('users (e2e)', () => {
	let t: TestApp;

	beforeAll(async () => {
		t = await createTestApp();
	});

	afterAll(() => t.close());

	describe('GET /users/me', () => {
		it('로그인한 user를 돌려준다', async () => {
			const { token, user_id, profile } = await t.login();

			const response = await t.http().get('/users/me').set('Authorization', `Bearer ${token}`).expect(200);

			const user = await t.prisma.user.findUniqueOrThrow({ where: { id: user_id } });
			expect(response.body).toEqual({
				id: user_id,
				email: profile.email,
				name: profile.name,
				avatar_url: profile.picture,
				created_at: user.created_at.toISOString(),
				updated_at: user.updated_at.toISOString(),
			});
		});

		it('토큰이 없으면 401 unauthenticated', async () => {
			const response = await t.http().get('/users/me').expect(401);
			expect(errorOf(response).code).toBe('unauthenticated');
		});
	});
});
