// 구글 로그인 시 기존 계정과 어떻게 이을지 정한다. 규칙 근거는 context-notes.md "user_identity를 지금 분리한 이유".
export type GoogleLoginDecision =
	| { kind: 'login'; user_id: number }
	| { kind: 'link'; user_id: number }
	| { kind: 'signup' }
	| { kind: 'reject' };

export function decideGoogleLogin(input: {
	identity_user_id: number | null;
	email_user_id: number | null;
	email_verified: boolean;
}): GoogleLoginDecision {
	if (input.identity_user_id !== null) return { kind: 'login', user_id: input.identity_user_id };
	// 검증되지 않은 이메일로는 가입도 연결도 하지 않는다. 연결하면 계정 탈취 경로가 된다.
	if (!input.email_verified) return { kind: 'reject' };
	if (input.email_user_id !== null) return { kind: 'link', user_id: input.email_user_id };
	return { kind: 'signup' };
}
