import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { GoogleAuthLibraryVerifier } from './adapters/google-auth-library.verifier';
import { JwtTokenIssuer } from './adapters/jwt.token-issuer';
import { PrismaAccountRepository } from './adapters/prisma-account.repository';
import { PrismaMembershipRepository } from './adapters/prisma-membership.repository';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ACCOUNT_REPOSITORY } from './ports/account.repository';
import { GOOGLE_ID_TOKEN_VERIFIER } from './ports/google-id-token.verifier';
import { MEMBERSHIP_REPOSITORY } from './ports/membership.repository';
import { TOKEN_ISSUER } from './ports/token.issuer';

@Module({
	imports: [
		JwtModule.registerAsync({
			inject: [ConfigService],
			// refresh 없이 7일. 근거는 context-notes.md "로그인" 절
			useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET'), signOptions: { expiresIn: '7d' } }),
		}),
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		{ provide: GOOGLE_ID_TOKEN_VERIFIER, useClass: GoogleAuthLibraryVerifier },
		{ provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
		{ provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
		{ provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
		{ provide: APP_GUARD, useClass: AuthGuard },
	],
})
export class AuthModule {}
