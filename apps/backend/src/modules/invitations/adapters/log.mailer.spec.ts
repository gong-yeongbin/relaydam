import { Logger } from '@nestjs/common';
import { LogMailer } from './log.mailer';

describe('LogMailer', () => {
	it('발송하지 않고 수신자·제목만 로그에 남긴다. 본문(수락 링크)은 남기지 않는다', async () => {
		const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

		await new LogMailer().send({ to: 'kim@example.com', subject: '초대', text: 'https://app.test/invitations/secret-token' });

		expect(log).toHaveBeenCalledWith({ to: 'kim@example.com', subject: '초대' }, '메일 발송 생략(production 아님)');
		expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token');
		log.mockRestore();
	});
});
