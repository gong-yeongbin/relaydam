import { ConfigService } from '@nestjs/config';
import { type LoginTicket, OAuth2Client, type TokenPayload } from 'google-auth-library';
import { GoogleAuthLibraryVerifier } from './google-auth-library.verifier';

// 구글 공개키 조회·서명 검증은 라이브러리 몫이다. 여기서는 audience 전달과 payload 변환만 본다.
describe('GoogleAuthLibraryVerifier', () => {
	const verifier = new GoogleAuthLibraryVerifier(new ConfigService({ GOOGLE_CLIENT_ID: 'client-id' }));

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	function payloadIs(payload: Partial<TokenPayload> | undefined) {
		return vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => payload } as unknown as LoginTicket as never);
	}

	it('우리 클라이언트 ID를 audience로 넘기고 프로필로 바꾼다', async () => {
		const verify = payloadIs({ sub: 's', email: 'a@example.com', email_verified: true, name: 'A', picture: 'https://p' });

		expect(await verifier.verify('token')).toEqual({ sub: 's', email: 'a@example.com', email_verified: true, name: 'A', picture: 'https://p' });
		expect(verify).toHaveBeenCalledWith({ idToken: 'token', audience: 'client-id' });
	});

	it('이름·사진이 없으면 이메일·null로 채우고, email_verified가 없으면 false', async () => {
		payloadIs({ sub: 's', email: 'a@example.com' });
		expect(await verifier.verify('token')).toEqual({ sub: 's', email: 'a@example.com', email_verified: false, name: 'a@example.com', picture: null });
	});

	it('이메일이 없는 토큰은 null', async () => {
		payloadIs({ sub: 's' });
		expect(await verifier.verify('token')).toBeNull();
	});

	it('검증에 실패하면 null', async () => {
		vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('Wrong recipient'));
		expect(await verifier.verify('token')).toBeNull();
	});

	it('GOOGLE_CLIENT_ID가 없으면 생성 시 던진다', () => {
		// ConfigService는 process.env로 폴백하는데 test/setup.ts가 기본값을 채워 둔다
		vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
		expect(() => new GoogleAuthLibraryVerifier(new ConfigService({}))).toThrow('GOOGLE_CLIENT_ID');
	});
});
