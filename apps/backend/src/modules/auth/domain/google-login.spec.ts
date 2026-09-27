import { decideGoogleLogin } from './google-login';

describe('decideGoogleLogin', () => {
	it('구글 identity가 있으면 그 유저로 로그인한다. 이메일 검증 여부와 무관하다', () => {
		expect(decideGoogleLogin({ identity_user_id: 1, email_user_id: null, email_verified: false })).toEqual({ kind: 'login', user_id: 1 });
	});

	it('identity가 없고 이메일이 검증되지 않았으면 거절한다', () => {
		expect(decideGoogleLogin({ identity_user_id: null, email_user_id: 2, email_verified: false })).toEqual({ kind: 'reject' });
		expect(decideGoogleLogin({ identity_user_id: null, email_user_id: null, email_verified: false })).toEqual({ kind: 'reject' });
	});

	it('검증된 이메일의 기존 유저가 있으면 identity를 연결한다', () => {
		expect(decideGoogleLogin({ identity_user_id: null, email_user_id: 2, email_verified: true })).toEqual({ kind: 'link', user_id: 2 });
	});

	it('아무것도 없으면 가입한다', () => {
		expect(decideGoogleLogin({ identity_user_id: null, email_user_id: null, email_verified: true })).toEqual({ kind: 'signup' });
	});
});
