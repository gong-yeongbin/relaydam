import { Logger } from '@nestjs/common';
import type { Mail, Mailer } from '../ports/mailer';

// production이 아닐 때 쓴다. 본문에는 수락 토큰(비밀)이 있어 수신자·제목만 남긴다
export class LogMailer implements Mailer {
	private readonly logger = new Logger(LogMailer.name);

	send(mail: Mail): Promise<void> {
		this.logger.log({ to: mail.to, subject: mail.subject }, '메일 발송 생략(production 아님)');
		return Promise.resolve();
	}
}
