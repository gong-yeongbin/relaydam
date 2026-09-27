import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { GoogleIdTokenVerifier, GoogleProfile } from '../ports/google-id-token.verifier';

@Injectable()
export class GoogleAuthLibraryVerifier implements GoogleIdTokenVerifier {
	private readonly clientId: string;
	private readonly client = new OAuth2Client();

	constructor(config: ConfigService) {
		this.clientId = config.getOrThrow<string>('GOOGLE_CLIENT_ID');
	}

	async verify(idToken: string): Promise<GoogleProfile | null> {
		let payload;
		try {
			// 구글 공개키로 서명을, audience로 우리 클라이언트에 발급된 토큰인지를, exp로 만료를 본다
			payload = (await this.client.verifyIdToken({ idToken, audience: this.clientId })).getPayload();
		} catch {
			return null;
		}
		if (!payload?.email) return null;

		return {
			sub: payload.sub,
			email: payload.email,
			email_verified: payload.email_verified === true,
			name: payload.name ?? payload.email,
			picture: payload.picture ?? null,
		};
	}
}
