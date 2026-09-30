import { UserController } from './user.controller';
import type { UserService } from './user.service';

describe('UserController', () => {
	it('주체의 user_id로 service를 부르고 결과를 그대로 돌려준다', async () => {
		const me = { id: 7, email: 'a@example.com' };
		const getMe = vi.fn().mockResolvedValue(me);
		const controller = new UserController({ getMe } as unknown as UserService);

		expect(await controller.me({ kind: 'user', user_id: 7, org_id: null, role: null })).toBe(me);
		expect(getMe).toHaveBeenCalledWith(7);
	});
});
