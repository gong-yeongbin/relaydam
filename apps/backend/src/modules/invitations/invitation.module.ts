import { SESv2Client } from '@aws-sdk/client-sesv2';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogMailer } from './adapters/log.mailer';
import { PrismaInvitationRepository } from './adapters/prisma-invitation.repository';
import { SesMailer } from './adapters/ses.mailer';
import { InvitationAcceptController, InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { APP_URL, INVITATION_REPOSITORY } from './ports/invitation.repository';
import { MAILER } from './ports/mailer';

@Module({
	controllers: [InvitationController, InvitationAcceptController],
	providers: [
		InvitationService,
		{ provide: INVITATION_REPOSITORY, useClass: PrismaInvitationRepository },
		// 로컬은 SES 자격 증명이 없어 발송을 생략한다. 근거는 context-notes.md "초대" 절
		{
			provide: MAILER,
			inject: [ConfigService],
			useFactory: (config: ConfigService) =>
				config.get<string>('NODE_ENV') === 'production' ? new SesMailer(new SESv2Client({}), config.getOrThrow<string>('MAIL_FROM')) : new LogMailer(),
		},
		{ provide: APP_URL, inject: [ConfigService], useFactory: (config: ConfigService) => config.getOrThrow<string>('APP_URL') },
	],
})
export class InvitationModule {}
