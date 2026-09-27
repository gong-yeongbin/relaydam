import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenIssuer } from '../ports/token.issuer';

// 만료(7일)·비밀키는 AuthModule의 JwtModule 등록에서 정한다
@Injectable()
export class JwtTokenIssuer implements TokenIssuer {
	constructor(private readonly jwt: JwtService) {}

	issue(userId: number): Promise<string> {
		return this.jwt.signAsync({ sub: String(userId) });
	}

	async verify(token: string): Promise<number | null> {
		try {
			const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token);
			return Number(sub);
		} catch {
			return null;
		}
	}
}
