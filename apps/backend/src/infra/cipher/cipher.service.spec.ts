import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CipherService } from './cipher.service';

describe('CipherService', () => {
	afterEach(() => vi.unstubAllEnvs());

	const cipherWith = (key: string) => new CipherService(new ConfigService({ ENCRYPTION_KEY: key }));
	const cipher = cipherWith(randomBytes(32).toString('base64'));

	it('암호화한 값을 복호화하면 원문이 나온다 (한글·빈 문자열 포함)', () => {
		for (const plain of ['whsec_abc123', '{"Authorization":"Bearer 토큰"}', '']) {
			const encrypted = cipher.encrypt(plain);
			expect(encrypted).not.toContain(plain || 'never');
			expect(cipher.decrypt(encrypted)).toBe(plain);
		}
	});

	it('같은 원문도 매번 다른 암호문이 된다 (IV가 무작위)', () => {
		expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
	});

	it('암호문이 변조됐으면 복호화가 던진다', () => {
		const raw = Buffer.from(cipher.encrypt('secret'), 'base64');
		raw.writeUInt8(raw.readUInt8(raw.length - 1) ^ 1, raw.length - 1);
		expect(() => cipher.decrypt(raw.toString('base64'))).toThrow();
	});

	it('다른 키로는 복호화가 던진다', () => {
		const other = cipherWith(randomBytes(32).toString('base64'));
		expect(() => other.decrypt(cipher.encrypt('secret'))).toThrow();
	});

	it('ENCRYPTION_KEY가 없거나 32바이트가 아니면 생성 시 던진다', () => {
		// ConfigService는 process.env로 폴백하는데 test/setup.ts가 기본값을 채워 둔다
		vi.stubEnv('ENCRYPTION_KEY', undefined);
		expect(() => new CipherService(new ConfigService({}))).toThrow('ENCRYPTION_KEY');
		expect(() => cipherWith(randomBytes(16).toString('base64'))).toThrow('32바이트');
	});
});
