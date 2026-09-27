import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { decideGoogleLogin } from './domain/google-login';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './ports/account.repository';
import { GOOGLE_ID_TOKEN_VERIFIER, type GoogleIdTokenVerifier } from './ports/google-id-token.verifier';
import { TOKEN_ISSUER, type TokenIssuer } from './ports/token.issuer';

@Injectable()
export class AuthService {
	constructor(
		@Inject(GOOGLE_ID_TOKEN_VERIFIER) private readonly google: GoogleIdTokenVerifier,
		@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
		@Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
	) {}

	async loginWithGoogle(idToken: string): Promise<{ access_token: string }> {
		const profile = await this.google.verify(idToken);
		if (!profile) throw new UnauthorizedException({ code: 'unauthenticated', message: '구글 토큰이 유효하지 않습니다.' });

		const decision = decideGoogleLogin({
			identity_user_id: await this.accounts.findUserIdByGoogleSub(profile.sub),
			email_user_id: await this.accounts.findUserIdByEmail(profile.email),
			email_verified: profile.email_verified,
		});

		let userId: number;
		switch (decision.kind) {
			case 'reject':
				throw new UnauthorizedException({ code: 'unauthenticated', message: '구글에서 검증되지 않은 이메일입니다.' });
			case 'link':
				await this.accounts.linkGoogleIdentity(decision.user_id, profile.sub);
				userId = decision.user_id;
				break;
			case 'login':
				userId = decision.user_id;
				break;
			case 'signup':
				userId = await this.accounts.signUpWithGoogle(profile);
				break;
		}

		return { access_token: await this.tokens.issue(userId) };
	}
}
