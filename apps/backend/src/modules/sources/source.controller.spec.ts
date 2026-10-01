import { SourceController } from './source.controller';
import type { SourceService } from './source.service';

describe('SourceController', () => {
	const service = {
		list: vi.fn().mockResolvedValue('page'),
		create: vi.fn().mockResolvedValue('created'),
		get: vi.fn().mockResolvedValue('source'),
		update: vi.fn().mockResolvedValue('updated'),
		rotateSlug: vi.fn().mockResolvedValue('rotated'),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const controller = new SourceController(service as unknown as SourceService);
	const project = { orgId: 1, projectId: 10 };
	const source = { ...project, sourceId: 7 };

	it('경로·쿼리·본문을 service에 그대로 넘긴다', async () => {
		expect(await controller.list(project, { limit: 50 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50 });

		expect(await controller.create(project, { name: 'toss' })).toBe('created');
		expect(service.create).toHaveBeenCalledWith(10, { name: 'toss' });

		expect(await controller.get(source)).toBe('source');
		expect(service.get).toHaveBeenCalledWith(10, 7);

		expect(await controller.update(source, { name: 'n' })).toBe('updated');
		expect(service.update).toHaveBeenCalledWith(10, 7, { name: 'n' });

		expect(await controller.rotateSlug(source)).toBe('rotated');
		expect(service.rotateSlug).toHaveBeenCalledWith(10, 7);

		await controller.remove(source);
		expect(service.remove).toHaveBeenCalledWith(10, 7);
	});
});
