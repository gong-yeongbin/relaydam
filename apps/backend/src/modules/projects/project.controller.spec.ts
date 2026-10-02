import { ProjectController } from './project.controller';
import type { ProjectService } from './project.service';

describe('ProjectController', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('created'),
		get: vi.fn().mockResolvedValue('project'),
		update: vi.fn().mockResolvedValue('updated'),
		remove: vi.fn().mockResolvedValue(undefined),
		getSigningSecret: vi.fn().mockResolvedValue('secret'),
		rotateSigningSecret: vi.fn().mockResolvedValue('rotated'),
	};
	const controller = new ProjectController(service as unknown as ProjectService);

	it('경로·쿼리·본문을 service에 그대로 넘긴다', async () => {
		expect(await controller.list({ orgId: 1 }, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(1, { limit: 50 });

		expect(await controller.create({ orgId: 1 }, { name: 'shop' })).toBe('created');
		expect(service.create).toHaveBeenCalledWith(1, { name: 'shop' });

		expect(await controller.get({ orgId: 1, projectId: 10 })).toBe('project');
		expect(service.get).toHaveBeenCalledWith(1, 10);

		expect(await controller.update({ orgId: 1, projectId: 10 }, { name: 'n' })).toBe('updated');
		expect(service.update).toHaveBeenCalledWith(1, 10, { name: 'n' });

		await controller.remove({ orgId: 1, projectId: 10 });
		expect(service.remove).toHaveBeenCalledWith(1, 10);

		expect(await controller.getSigningSecret({ orgId: 1, projectId: 10 })).toBe('secret');
		expect(service.getSigningSecret).toHaveBeenCalledWith(1, 10);

		expect(await controller.rotateSigningSecret({ orgId: 1, projectId: 10 })).toBe('rotated');
		expect(service.rotateSigningSecret).toHaveBeenCalledWith(1, 10);
	});
});
