import { z } from 'zod';

// source.signature_config의 모양. 쓸 때(DTO 검증)와 읽을 때(DB Json → 타입) 같은 스키마를 쓴다.
// 범용 HMAC-SHA256 설정 하나뿐이다. 업체 프리셋은 두지 않는다. 모르는 필드는 거부한다.

// HTTP 헤더 이름. Fastify가 수신 헤더를 소문자로 주므로 소문자로 맞춰 저장한다.
const headerName = z
	.string()
	.max(100)
	.regex(/^[A-Za-z0-9-]+$/, '헤더 이름은 영문·숫자·하이픈만 쓸 수 있습니다.')
	.toLowerCase();

// 서명 대상 문자열. `{body}`는 원본 본문, `{header:이름}`은 그 헤더 값. 예: `{header:webhook-id}.{body}`
const signedPayload = z
	.string()
	.max(300)
	.regex(/^(?:[^{}]|\{body\}|\{header:[A-Za-z0-9-]+\})*$/, '자리표시자는 {body}와 {header:이름}만 쓸 수 있습니다.')
	.refine((value) => value.includes('{body}'), '{body}가 있어야 합니다.');

export const signatureConfigSchema = z.strictObject({
	// 서명이 담긴 헤더
	header: headerName,
	encoding: z.enum(['hex', 'base64']).default('hex'),
	// 시크릿을 HMAC 키로 바꾸는 방법. utf8은 글자 그대로, base64는 디코딩한 바이트가 키다.
	// Standard Webhooks 규격(포트원 V2, Svix)은 `whsec_` 뒤가 base64 키라 base64로 둔다
	secret_encoding: z.enum(['utf8', 'base64']).default('utf8'),
	// 서명 값 앞에 붙는 문자열. 예: GitHub `sha256=`
	prefix: z.string().max(32).optional(),
	signed_payload: signedPayload.default('{body}'),
	// 재전송 공격 방지. 이 헤더의 시각이 허용 오차 밖이면 거부한다
	timestamp_header: headerName.optional(),
	tolerance_sec: z.number().int().min(1).max(3600).default(300),
	// 멱등 키로 쓸 헤더. 없으면 본문 해시
	event_id_header: headerName.optional(),
});

export type SignatureConfig = z.infer<typeof signatureConfigSchema>;
