import { newSigningSecret } from './signing-secret';

describe('newSigningSecret', () => {
	it('rdsec_ 뒤에 32바이트를 base64url로 적은 43자', () => {
		expect(newSigningSecret()).toMatch(/^rdsec_[A-Za-z0-9_-]{43}$/);
	});

	it('매번 다르다', () => {
		expect(new Set(Array.from({ length: 100 }, newSigningSecret)).size).toBe(100);
	});
});
