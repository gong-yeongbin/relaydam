import { createHmac } from 'node:crypto';
import { type SignatureConfig, signatureConfigSchema } from '@/modules/sources/domain/signature-config';
import { headerValue, verifySignature } from './signature';

const config = (input: object): SignatureConfig => signatureConfigSchema.parse(input);
const NOW = new Date('2026-10-02T00:00:00Z');
const hmac = (secret: string | Buffer, payload: string, encoding: 'hex' | 'base64' = 'hex') => createHmac('sha256', secret).update(payload).digest(encoding);

describe('verifySignature', () => {
	describe('GitHub 형식 — 공식 문서(Validating webhook deliveries)의 예시 값', () => {
		const github = config({ header: 'X-Hub-Signature-256', prefix: 'sha256=', event_id_header: 'X-GitHub-Delivery' });
		const secret = "It's a Secret to Everybody";
		const body = Buffer.from('Hello, World!');
		const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
		const verify = (headers: Record<string, string>, payload = body) => verifySignature({ config: github, secret, headers, body: payload, now: NOW });

		it('맞는 서명은 ok', () => {
			expect(verify({ 'x-hub-signature-256': signature })).toBe('ok');
		});

		it('본문이 한 글자라도 다르면 signature_mismatch', () => {
			expect(verify({ 'x-hub-signature-256': signature }, Buffer.from('Hello, World?'))).toBe('signature_mismatch');
		});

		it('서명 헤더가 없거나 비어 있으면 signature_missing', () => {
			expect(verify({})).toBe('signature_missing');
			expect(verify({ 'x-hub-signature-256': '' })).toBe('signature_missing');
		});

		it('접두사가 없거나, hex가 아니거나, 길이가 다르면 signature_mismatch', () => {
			expect(verify({ 'x-hub-signature-256': signature.replace('sha256=', '') })).toBe('signature_mismatch');
			expect(verify({ 'x-hub-signature-256': 'sha256=not-hex' })).toBe('signature_mismatch');
			expect(verify({ 'x-hub-signature-256': 'sha256=7571' })).toBe('signature_mismatch');
		});
	});

	describe('Standard Webhooks 형식(포트원 V2, Svix) — 규격 문서의 예시 값', () => {
		const standard = config({
			header: 'webhook-signature',
			encoding: 'base64',
			secret_encoding: 'base64',
			prefix: 'v1,',
			signed_payload: '{header:webhook-id}.{header:webhook-timestamp}.{body}',
			timestamp_header: 'webhook-timestamp',
			event_id_header: 'webhook-id',
		});
		const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
		const body = Buffer.from('{"test": 2432232314}');
		const headers = {
			'webhook-id': 'msg_p5jXN8AQM9LWM0D4loKWxJek',
			'webhook-timestamp': '1614265330',
			'webhook-signature': 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
		};
		const sentAt = new Date(1614265330 * 1000);
		const verify = (overrides: Record<string, string | undefined>, now = sentAt) => verifySignature({ config: standard, secret, headers: { ...headers, ...overrides }, body, now });

		it('맞는 서명은 ok. 시크릿은 whsec_ 뒤를 base64로 푼 바이트가 키다', () => {
			expect(verify({})).toBe('ok');
		});

		it('키 회전 중이라 서명이 여러 개 와도 하나만 맞으면 ok', () => {
			expect(verify({ 'webhook-signature': `v1,AAAA v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE= v2,ignored` })).toBe('ok');
		});

		it('허용 오차(300초) 안이면 ok, 넘으면 timestamp_out_of_range (과거·미래 모두)', () => {
			expect(verify({}, new Date(sentAt.getTime() + 300_000))).toBe('ok');
			expect(verify({}, new Date(sentAt.getTime() + 301_000))).toBe('timestamp_out_of_range');
			expect(verify({}, new Date(sentAt.getTime() - 301_000))).toBe('timestamp_out_of_range');
		});

		it('시각 헤더가 없으면 signature_missing, 읽을 수 없으면 timestamp_out_of_range', () => {
			expect(verify({ 'webhook-timestamp': undefined })).toBe('signature_missing');
			expect(verify({ 'webhook-timestamp': 'yesterday' })).toBe('timestamp_out_of_range');
		});

		it('서명 대상에 들어가는 헤더가 없으면 signature_missing, 값이 바뀌면 signature_mismatch', () => {
			expect(verify({ 'webhook-id': undefined })).toBe('signature_missing');
			expect(verify({ 'webhook-id': 'msg_other' })).toBe('signature_mismatch');
		});
	});

	describe('범용 설정', () => {
		const secret = 'shared-secret';
		const body = Buffer.from('{"ok":true}');

		it('토스 지급대행 형식 — `{body}:{전송시각}`, base64, 쉼표로 이은 여러 서명', () => {
			const toss = config({
				header: 'tosspayments-webhook-signature',
				encoding: 'base64',
				prefix: 'v1:',
				signed_payload: '{body}:{header:tosspayments-webhook-transmission-time}',
			});
			const time = '2026-10-02T09:00:00+09:00';
			const valid = hmac(secret, `{"ok":true}:${time}`, 'base64');
			const headers = { 'tosspayments-webhook-transmission-time': time, 'tosspayments-webhook-signature': `v1:${hmac('old-key', 'x', 'base64')},v1:${valid}` };

			expect(verifySignature({ config: toss, secret, headers, body, now: NOW })).toBe('ok');
			expect(verifySignature({ config: toss, secret: 'wrong', headers, body, now: NOW })).toBe('signature_mismatch');
		});

		it('접두사 없이 hex 서명만 오는 형식. 대문자 hex도 받는다', () => {
			const plain = config({ header: 'x-signature' });
			const valid = hmac(secret, '{"ok":true}');
			expect(verifySignature({ config: plain, secret, headers: { 'x-signature': valid }, body, now: NOW })).toBe('ok');
			expect(verifySignature({ config: plain, secret, headers: { 'x-signature': valid.toUpperCase() }, body, now: NOW })).toBe('ok');
		});

		it('시각 헤더는 초·밀리초 epoch와 ISO 8601을 읽는다', () => {
			const timed = config({ header: 'x-signature', timestamp_header: 'x-timestamp', tolerance_sec: 60 });
			const valid = hmac(secret, '{"ok":true}');
			const at = (timestamp: string) => verifySignature({ config: timed, secret, headers: { 'x-signature': valid, 'x-timestamp': timestamp }, body, now: NOW });

			expect(at(String(NOW.getTime() / 1000))).toBe('ok');
			expect(at(String(NOW.getTime()))).toBe('ok');
			expect(at(NOW.toISOString())).toBe('ok');
			expect(at(String(NOW.getTime() / 1000 - 61))).toBe('timestamp_out_of_range');
		});

		it('글자가 아닌 바이트가 섞인 본문도 받은 그대로 서명한다', () => {
			const plain = config({ header: 'x-signature' });
			const binary = Buffer.from([0xff, 0xfe, 0x00, 0x41]);
			const valid = createHmac('sha256', secret).update(binary).digest('hex');
			expect(verifySignature({ config: plain, secret, headers: { 'x-signature': valid }, body: binary, now: NOW })).toBe('ok');
		});
	});
});

describe('headerValue', () => {
	it('같은 이름이 여러 번 오면 첫 값, 빈 값과 없는 헤더는 undefined', () => {
		expect(headerValue({ 'x-a': ['first', 'second'] }, 'x-a')).toBe('first');
		expect(headerValue({ 'x-a': 'only' }, 'x-a')).toBe('only');
		expect(headerValue({ 'x-a': '' }, 'x-a')).toBeUndefined();
		expect(headerValue({}, 'x-a')).toBeUndefined();
	});
});
