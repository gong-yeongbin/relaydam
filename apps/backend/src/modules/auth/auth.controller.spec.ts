import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
	it('id_token을 service에 넘기고 결과를 그대로 돌려준다', async () => {
		const loginWithGoogle = vi.fn().mockResolvedValue({ access_token: 'token' });
		const controller = new AuthController({ loginWithGoogle } as unknown as AuthService);

		expect(await controller.google({ id_token: 'id-token' })).toEqual({ access_token: 'token' });
		expect(loginWithGoogle).toHaveBeenCalledWith('id-token');
	});
});
