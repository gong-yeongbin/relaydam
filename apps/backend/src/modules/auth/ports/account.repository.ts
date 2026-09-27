import type { GoogleProfile } from './google-id-token.verifier';

export interface AccountRepository {
	findUserIdByGoogleSub(sub: string): Promise<number | null>;
	findUserIdByEmail(email: string): Promise<number | null>;
	linkGoogleIdentity(userId: number, sub: string): Promise<void>;
	// user + user_identity + 개인 organization(free) + member(owner)를 한 트랜잭션으로 만든다
	signUpWithGoogle(profile: GoogleProfile): Promise<number>;
}

export const ACCOUNT_REPOSITORY = Symbol('AccountRepository');
