import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { AccountRepository } from './ports/account.repository';
import type { GoogleIdTokenVerifier, GoogleProfile } from './ports/google-id-token.verifier';
import type { TokenIssuer } from './ports/token.issuer';

const PROFILE: GoogleProfile = { sub: 'g-1', email: 'a@example.com', email_verified: true, name: 'A', picture: null };

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeAccounts implements AccountRepository {
	bySub = new Map<string, number>();
	byEmail = new Map<string, number>();
	nextId = 100;

	findUserIdByGoogleSub(sub: string) {
		return Promise.resolve(this.bySub.get(sub) ?? null);
	}
	findUserIdByEmail(email: string) {
		return Promise.resolve(this.byEmail.get(email) ?? null);
	}
	linkGoogleIdentity(userId: number, sub: string) {
		this.bySub.set(sub, userId);
		return Promise.resolve();
	}
	signUpWithGoogle(profile: GoogleProfile) {
		const id = this.nextId++;
		this.bySub.set(profile.sub, id);
		this.byEmail.set(profile.email, id);
		return Promise.resolve(id);
	}
}

const tokens: TokenIssuer = { issue: (userId) => Promise.resolve(`token-${userId}`), verify: () => Promise.resolve(null) };

function serviceWith(profile: GoogleProfile | null, accounts = new FakeAccounts()) {
	const google: GoogleIdTokenVerifier = { verify: () => Promise.resolve(profile) };
	return { service: new AuthService(google, accounts, tokens), accounts };
}

describe('AuthService.loginWithGoogle', () => {
	it('처음이면 가입하고 토큰을 준다', async () => {
		const { service, accounts } = serviceWith(PROFILE);

		expect(await service.loginWithGoogle('id-token')).toEqual({ access_token: 'token-100' });
		expect(accounts.bySub.get('g-1')).toBe(100);
	});

	it('두 번째 로그인은 같은 유저로 토큰을 주고 다시 가입하지 않는다', async () => {
		const { service, accounts } = serviceWith(PROFILE);
		await service.loginWithGoogle('id-token');

		expect(await service.loginWithGoogle('id-token')).toEqual({ access_token: 'token-100' });
		expect(accounts.nextId).toBe(101);
	});

	it('같은 이메일의 기존 유저에게 구글 identity를 연결한다', async () => {
		const accounts = new FakeAccounts();
		accounts.byEmail.set(PROFILE.email, 7);
		const { service } = serviceWith(PROFILE, accounts);

		expect(await service.loginWithGoogle('id-token')).toEqual({ access_token: 'token-7' });
		expect(accounts.bySub.get('g-1')).toBe(7);
	});

	it('구글 토큰이 유효하지 않으면 401', async () => {
		const { service } = serviceWith(null);
		await expect(service.loginWithGoogle('bad')).rejects.toThrow(UnauthorizedException);
	});

	it('검증되지 않은 이메일이면 401', async () => {
		const { service } = serviceWith({ ...PROFILE, email_verified: false });
		await expect(service.loginWithGoogle('id-token')).rejects.toThrow(UnauthorizedException);
	});
});
