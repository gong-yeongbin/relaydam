export type GoogleProfile = {
	sub: string;
	email: string;
	email_verified: boolean;
	name: string;
	picture: string | null;
};

export interface GoogleIdTokenVerifier {
	// 서명·aud·만료가 유효하지 않으면 null
	verify(idToken: string): Promise<GoogleProfile | null>;
}

export const GOOGLE_ID_TOKEN_VERIFIER = Symbol('GoogleIdTokenVerifier');
