import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SignatureConfig } from '@/modules/sources/domain/signature-config';

// Fastify가 주는 수신 헤더. 이름은 소문자다
export type RequestHeaders = Record<string, string | string[] | undefined>;

export type SignatureResult = 'ok' | 'signature_missing' | 'signature_mismatch' | 'timestamp_out_of_range';

// 같은 이름의 헤더가 여러 번 오면 첫 값을 쓴다. 빈 값은 없는 것으로 본다
export function headerValue(headers: RequestHeaders, name: string): string | undefined {
	const value = headers[name];
	const first = Array.isArray(value) ? value[0] : value;
	return first === '' ? undefined : first;
}

// Standard Webhooks 규격의 시크릿은 `whsec_` 뒤가 base64로 인코딩한 키다
function secretKey(secret: string, encoding: SignatureConfig['secret_encoding']): Buffer {
	return encoding === 'base64' ? Buffer.from(secret.replace(/^whsec_/, ''), 'base64') : Buffer.from(secret, 'utf8');
}

// 초 또는 밀리초 epoch, 아니면 ISO 8601. 못 읽으면 null
function parseTimestamp(value: string): number | null {
	if (/^\d+$/.test(value)) {
		const number = Number(value);
		return number > 1e11 ? number : number * 1000;
	}
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

// 템플릿(`{body}`, `{header:이름}`, 그 밖의 글자)을 바이트로 만든다. 참조한 헤더가 없으면 null.
// 템플릿의 모양은 signatureConfigSchema가 보장한다
function signedPayload(template: string, headers: RequestHeaders, body: Buffer): Buffer | null {
	const parts: Buffer[] = [];
	for (const token of template.split(/(\{body\}|\{header:[A-Za-z0-9-]+\})/)) {
		if (token === '{body}') {
			parts.push(body);
		} else if (token.startsWith('{header:')) {
			const value = headerValue(headers, token.slice('{header:'.length, -1).toLowerCase());
			if (value === undefined) return null;
			parts.push(Buffer.from(value, 'utf8'));
		} else {
			parts.push(Buffer.from(token, 'utf8'));
		}
	}
	return Buffer.concat(parts);
}

// 서명 헤더에서 서명 후보를 꺼낸다. 키 회전 중에는 업체가 서명을 여러 개 보낸다
// (`v1,aaa v1,bbb`, `v1:aaa,v1:bbb`). 접두사가 있으면 접두사 뒤의 값만 후보다
function candidates(value: string, prefix: string | undefined): string[] {
	const pieces = prefix ? value.split(prefix).slice(1) : [value];
	return pieces.flatMap((piece) => piece.split(/[\s,]+/)).filter((candidate) => candidate !== '');
}

function decode(candidate: string, encoding: SignatureConfig['encoding']): Buffer | null {
	if (encoding === 'base64') return Buffer.from(candidate, 'base64');
	return /^(?:[0-9a-fA-F]{2})+$/.test(candidate) ? Buffer.from(candidate, 'hex') : null;
}

// HMAC-SHA256 서명 검증. body는 받은 바이트 그대로여야 한다
export function verifySignature(input: { config: SignatureConfig; secret: string; headers: RequestHeaders; body: Buffer; now: Date }): SignatureResult {
	const { config, headers } = input;
	const signature = headerValue(headers, config.header);
	if (signature === undefined) return 'signature_missing';

	if (config.timestamp_header) {
		const raw = headerValue(headers, config.timestamp_header);
		if (raw === undefined) return 'signature_missing';
		const timestamp = parseTimestamp(raw);
		if (timestamp === null || Math.abs(input.now.getTime() - timestamp) > config.tolerance_sec * 1000) return 'timestamp_out_of_range';
	}

	const payload = signedPayload(config.signed_payload, headers, input.body);
	if (payload === null) return 'signature_missing';

	const expected = createHmac('sha256', secretKey(input.secret, config.secret_encoding)).update(payload).digest();
	const matched = candidates(signature, config.prefix).some((candidate) => {
		const given = decode(candidate, config.encoding);
		// timingSafeEqual은 길이가 다르면 던진다
		return given !== null && given.length === expected.length && timingSafeEqual(given, expected);
	});
	return matched ? 'ok' : 'signature_mismatch';
}
