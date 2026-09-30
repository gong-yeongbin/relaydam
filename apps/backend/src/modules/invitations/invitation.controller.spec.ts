import type { Actor } from '@/common/auth/decorators';
import { InvitationAcceptController, InvitationController } from './invitation.controller';
import type { InvitationService } from './invitation.service';

describe('Invitation 컨트롤러', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('invitation'),
		cancel: vi.fn().mockResolvedValue(undefined),
		accept: vi.fn().mockResolvedValue('member'),
	};
	const actor: Actor = { kind: 'user', user_id: 7, org_id: 1, role: 'admin' };

	it('InvitationController — list·create·cancel에 경로·본문을 넘긴다', async () => {
		const controller = new InvitationController(service as unknown as InvitationService);

		expect(await controller.list({ orgId: 1 }, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(1, { limit: 50 });

		expect(await controller.create(actor, { orgId: 1 }, { email: 'kim@example.com', role: 'member' })).toBe('invitation');
		expect(service.create).toHaveBeenCalledWith(actor, 1, { email: 'kim@example.com', role: 'member' });

		await controller.cancel({ orgId: 1, invitationId: 5 });
		expect(service.cancel).toHaveBeenCalledWith(1, 5);
	});

	it('InvitationAcceptController — 주체와 토큰을 넘긴다', async () => {
		const controller = new InvitationAcceptController(service as unknown as InvitationService);

		expect(await controller.accept(actor, { token: 'tok' })).toBe('member');
		expect(service.accept).toHaveBeenCalledWith(actor, 'tok');
	});
});
