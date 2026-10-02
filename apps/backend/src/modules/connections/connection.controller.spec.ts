import { ConnectionController } from './connection.controller';
import type { ConnectionService } from './connection.service';

describe('ConnectionController', () => {
	afterEach(() => vi.useRealTimers());

	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('created'),
		get: vi.fn().mockResolvedValue('connection'),
		update: vi.fn().mockResolvedValue('updated'),
		pause: vi.fn().mockResolvedValue('paused'),
		unpause: vi.fn().mockResolvedValue('unpaused'),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const controller = new ConnectionController(service as unknown as ConnectionService);
	const project = { orgId: 1, projectId: 10 };
	const connection = { ...project, connectionId: 12 };

	it('경로·쿼리·본문을 service에 그대로 넘긴다', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-02T00:00:00Z') });

		expect(await controller.list(project, { limit: 50, source_id: 7 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50, source_id: 7 });

		expect(await controller.create(project, { source_id: 7, destination_id: 3, retry_count: 3 })).toBe('created');
		expect(service.create).toHaveBeenCalledWith(10, { source_id: 7, destination_id: 3, retry_count: 3 });

		expect(await controller.get(connection)).toBe('connection');
		expect(service.get).toHaveBeenCalledWith(10, 12);

		expect(await controller.update(connection, { retry_strategy: 'linear' })).toBe('updated');
		expect(service.update).toHaveBeenCalledWith(10, 12, { retry_strategy: 'linear' });

		expect(await controller.pause(connection)).toBe('paused');
		expect(service.pause).toHaveBeenCalledWith(10, 12, new Date('2026-10-02T00:00:00Z'));

		expect(await controller.unpause(connection)).toBe('unpaused');
		expect(service.unpause).toHaveBeenCalledWith(10, 12);

		await controller.remove(connection);
		expect(service.remove).toHaveBeenCalledWith(10, 12);
	});
});
