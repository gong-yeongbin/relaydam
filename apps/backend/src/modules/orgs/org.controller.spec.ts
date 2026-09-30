import { OrgController } from './org.controller';
import type { OrgService } from './org.service';

describe('OrgController', () => {
	const service = { list: vi.fn().mockResolvedValue('page'), get: vi.fn().mockResolvedValue('org'), update: vi.fn().mockResolvedValue('updated') };
	const controller = new OrgController(service as unknown as OrgService);

	it('list — 주체의 user_id와 쿼리를 넘긴다', async () => {
		expect(await controller.list({ kind: 'user', user_id: 7, org_id: null, role: null }, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(7, { limit: 50 });
	});

	it('get — 경로의 orgId를 넘긴다', async () => {
		expect(await controller.get({ orgId: 3 })).toBe('org');
		expect(service.get).toHaveBeenCalledWith(3);
	});

	it('update — orgId와 본문을 넘긴다', async () => {
		expect(await controller.update({ orgId: 3 }, { name: 'n' })).toBe('updated');
		expect(service.update).toHaveBeenCalledWith(3, { name: 'n' });
	});
});
