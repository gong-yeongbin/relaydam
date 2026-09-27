import { JwtService } from '@nestjs/jwt';
import { JwtTokenIssuer } from './jwt.token-issuer';

describe('JwtTokenIssuer', () => {
	const issuer = new JwtTokenIssuer(new JwtService({ secret: 'secret', signOptions: { expiresIn: '7d' } }));

	it('발급한 토큰을 검증하면 user_id가 나온다', async () => {
		expect(await issuer.verify(await issuer.issue(42))).toBe(42);
	});

	it('다른 키로 서명한 토큰은 null', async () => {
		const other = new JwtTokenIssuer(new JwtService({ secret: 'other' }));
		expect(await issuer.verify(await other.issue(42))).toBeNull();
	});

	it('만료된 토큰은 null', async () => {
		const expired = await new JwtService({ secret: 'secret' }).signAsync({ sub: '42', exp: Math.floor(Date.now() / 1000) - 1 });
		expect(await issuer.verify(expired)).toBeNull();
	});
});
