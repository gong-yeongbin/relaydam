import type { Actor } from '@/common/auth/decorators';
import { MemberController } from './member.controller';
import type { MemberService } from './member.service';

describe('MemberController', () => {
	const service = { list: vi.fn().mockResolvedValue('page'), changeRole: vi.fn().mockResolvedValue('member'), remove: vi.fn().mockResolvedValue(undefined) };
	const controller = new MemberController(service as unknown as MemberService);
	const actor: Actor = { kind: 'user', user_id: 7, org_id: 1, role: 'admin' };

	it('list — orgId와 쿼리를 넘긴다', async () => {
		expect(await controller.list({ orgId: 1 }, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(1, { limit: 50 });
	});

	it('changeRole — orgId·userId·role을 넘긴다', async () => {
		expect(await controller.changeRole({ orgId: 1, userId: 3 }, { role: 'admin' })).toBe('member');
		expect(service.changeRole).toHaveBeenCalledWith(1, 3, 'admin');
	});

	it('remove — 주체와 대상을 넘긴다', async () => {
		await controller.remove(actor, { orgId: 1, userId: 3 });
		expect(service.remove).toHaveBeenCalledWith(actor, 1, 3);
	});
});
