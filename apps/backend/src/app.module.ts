import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from './common/logger-options';
import { CipherModule } from './infra/cipher/cipher.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { ValkeyModule } from './infra/valkey/valkey.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectionModule } from './modules/connections/connection.module';
import { DestinationModule } from './modules/destinations/destination.module';
import { HealthModule } from './modules/health/health.module';
import { IngressModule } from './modules/ingress/ingress.module';
import { InvitationModule } from './modules/invitations/invitation.module';
import { MemberModule } from './modules/members/member.module';
import { OrgModule } from './modules/orgs/org.module';
import { ProjectModule } from './modules/projects/project.module';
import { RejectedRequestModule } from './modules/rejected-requests/rejected-request.module';
import { SourceModule } from './modules/sources/source.module';
import { UserModule } from './modules/users/user.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		LoggerModule.forRoot(loggerOptions()),
		PrismaModule,
		ValkeyModule,
		CipherModule,
		AuthModule,
		HealthModule,
		UserModule,
		OrgModule,
		MemberModule,
		InvitationModule,
		ProjectModule,
		SourceModule,
		DestinationModule,
		ConnectionModule,
		IngressModule,
		RejectedRequestModule,
	],
})
export class AppModule {}
