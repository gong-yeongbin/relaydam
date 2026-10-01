import { DestinationController } from './destination.controller';
import type { DestinationService } from './destination.service';

describe('DestinationController', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('created'),
		get: vi.fn().mockResolvedValue('destination'),
		update: vi.fn().mockResolvedValue('updated'),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const controller = new DestinationController(service as unknown as DestinationService);
	const project = { orgId: 1, projectId: 10 };
	const destination = { ...project, destinationId: 3 };

	it('경로·쿼리·본문을 service에 그대로 넘긴다', async () => {
		expect(await controller.list(project, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50 });

		const body = { name: 'orders', url: 'https://api.example.com/hooks' };
		expect(await controller.create(project, body)).toBe('created');
		expect(service.create).toHaveBeenCalledWith(10, body);

		expect(await controller.get(destination)).toBe('destination');
		expect(service.get).toHaveBeenCalledWith(10, 3);

		expect(await controller.update(destination, { name: 'n' })).toBe('updated');
		expect(service.update).toHaveBeenCalledWith(10, 3, { name: 'n' });

		await controller.remove(destination);
		expect(service.remove).toHaveBeenCalledWith(10, 3);
	});
});
