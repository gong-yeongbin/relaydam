export interface TokenIssuer {
	issue(userId: number): Promise<string>;
	// 서명이 틀리거나 만료됐으면 null
	verify(token: string): Promise<number | null>;
}

export const TOKEN_ISSUER = Symbol('TokenIssuer');
