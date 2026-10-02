import { RejectedRequestController } from './rejected-request.controller';
import type { RejectedRequestService } from './rejected-request.service';

describe('RejectedRequestController', () => {
	it('경로·쿼리를 service에 그대로 넘긴다', async () => {
		const service = { list: vi.fn().mockResolvedValue('page') };
		const controller = new RejectedRequestController(service as unknown as RejectedRequestService);

		expect(await controller.list({ orgId: 1, projectId: 10 }, { limit: 50, source_id: 7, reason: 'signature_mismatch' })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50, source_id: 7, reason: 'signature_mismatch' });
	});
});
