import { DeliveryController } from './delivery.controller';
import type { DeliveryService } from './delivery.service';

describe('DeliveryController', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		get: vi.fn().mockResolvedValue('delivery'),
		retry: vi.fn().mockResolvedValue('retried'),
		bulkRetry: vi.fn().mockResolvedValue({ count: 3 }),
		cancel: vi.fn().mockResolvedValue('canceled'),
	};
	const controller = new DeliveryController(service as unknown as DeliveryService);
	const project = { orgId: 1, projectId: 10 };
	const delivery = { ...project, deliveryId: '345' };

	it('경로·쿼리·본문을 service에 그대로 넘긴다. id는 BigInt로 바꾼다', async () => {
		expect(await controller.list(project, { limit: 50, status: 'dead' })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50, status: 'dead' });

		expect(await controller.get(delivery)).toBe('delivery');
		expect(service.get).toHaveBeenCalledWith(10, 345n);

		expect(await controller.retry(delivery)).toBe('retried');
		expect(service.retry).toHaveBeenCalledWith(10, 345n);

		expect(await controller.bulkRetry(project, { status: 'dead', destination_id: 3 })).toEqual({ count: 3 });
		expect(service.bulkRetry).toHaveBeenCalledWith(10, { status: 'dead', destination_id: 3 });

		expect(await controller.cancel(delivery)).toBe('canceled');
		expect(service.cancel).toHaveBeenCalledWith(10, 345n);
	});
});
