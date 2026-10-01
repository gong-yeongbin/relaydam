import { ConnectionController } from './connection.controller';
import type { ConnectionService } from './connection.service';

describe('ConnectionController', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('created'),
		get: vi.fn().mockResolvedValue('connection'),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const controller = new ConnectionController(service as unknown as ConnectionService);
	const project = { orgId: 1, projectId: 10 };
	const connection = { ...project, connectionId: 12 };

	it('경로·쿼리·본문을 service에 그대로 넘긴다', async () => {
		expect(await controller.list(project, { limit: 50, source_id: 7 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50, source_id: 7 });

		expect(await controller.create(project, { source_id: 7, destination_id: 3 })).toBe('created');
		expect(service.create).toHaveBeenCalledWith(10, { source_id: 7, destination_id: 3 });

		expect(await controller.get(connection)).toBe('connection');
		expect(service.get).toHaveBeenCalledWith(10, 12);

		await controller.remove(connection);
		expect(service.remove).toHaveBeenCalledWith(10, 12);
	});
});
