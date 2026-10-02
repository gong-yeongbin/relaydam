import { signatureConfigSchema } from './signature-config';

describe('signatureConfigSchema', () => {
	const parse = (value: unknown) => signatureConfigSchema.safeParse(value);

	it('header만 보내면 기본값이 채워지고 헤더 이름은 소문자가 된다', () => {
		expect(parse({ header: 'X-Signature' })).toEqual({
			success: true,
			data: { header: 'x-signature', encoding: 'hex', secret_encoding: 'utf8', signed_payload: '{body}', tolerance_sec: 300 },
		});
	});

	it('모든 필드 (포트원 V2 형식)', () => {
		const input = {
			header: 'Webhook-Signature',
			encoding: 'base64',
			secret_encoding: 'base64',
			prefix: 'v1,',
			signed_payload: '{header:webhook-id}.{header:webhook-timestamp}.{body}',
			timestamp_header: 'Webhook-Timestamp',
			tolerance_sec: 60,
			event_id_header: 'Webhook-Id',
		};
		expect(parse(input)).toEqual({
			success: true,
			data: { ...input, header: 'webhook-signature', timestamp_header: 'webhook-timestamp', event_id_header: 'webhook-id' },
		});
	});

	it.each([
		['header 없음', {}],
		['header에 허용되지 않는 문자', { header: 'x signature' }],
		['모르는 encoding', { header: 'x-sig', encoding: 'base32' }],
		['모르는 secret_encoding', { header: 'x-sig', secret_encoding: 'hex' }],
		['signed_payload에 {body} 없음', { header: 'x-sig', signed_payload: '{header:x-id}' }],
		['signed_payload에 모르는 자리표시자', { header: 'x-sig', signed_payload: '{body}{query}' }],
		['tolerance_sec 범위 밖', { header: 'x-sig', tolerance_sec: 0 }],
		['tolerance_sec 소수', { header: 'x-sig', tolerance_sec: 1.5 }],
		['모르는 필드', { header: 'x-sig', algorithm: 'sha1' }],
		['프리셋 이름', { preset: 'github' }],
		['객체가 아님', 'github'],
		['null', null],
	])('거부 — %s', (_name, value) => {
		expect(parse(value).success).toBe(false);
	});
});
