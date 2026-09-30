import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import type { Mail, Mailer } from '../ports/mailer';

// 운영 발송. 인증은 ECS 태스크 역할이라 키를 받지 않는다. 근거는 context-notes.md "초대" 절
export class SesMailer implements Mailer {
	constructor(
		private readonly ses: SESv2Client,
		private readonly from: string,
	) {}

	async send(mail: Mail): Promise<void> {
		await this.ses.send(
			new SendEmailCommand({
				FromEmailAddress: this.from,
				Destination: { ToAddresses: [mail.to] },
				Content: { Simple: { Subject: { Data: mail.subject, Charset: 'UTF-8' }, Body: { Text: { Data: mail.text, Charset: 'UTF-8' } } } },
			}),
		);
	}
}
