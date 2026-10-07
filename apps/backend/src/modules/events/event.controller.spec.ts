import { EventController } from './event.controller';
import type { EventService } from './event.service';

describe('EventController', () => {
	afterEach(() => vi.useRealTimers());

	const service = {
		list: vi.fn().mockResolvedValue('page'),
		get: vi.fn().mockResolvedValue('event'),
		body: vi.fn().mockResolvedValue({ body: Buffer.from('{}'), content_type: 'application/json' }),
		replay: vi.fn().mockResolvedValue('replayed'),
	};
	const controller = new EventController(service as unknown as EventService);
	const project = { orgId: 1, projectId: 10 };
	const event = { ...project, eventId: '120' };

	it('경로·쿼리를 service에 그대로 넘긴다. id는 BigInt로 바꾼다', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-07T00:00:00Z') });

		expect(await controller.list(project, { limit: 50, source_id: 7 })).toBe('page');
		expect(service.list).toHaveBeenCalledWith(10, { limit: 50, source_id: 7 });

		expect(await controller.get(event)).toBe('event');
		expect(service.get).toHaveBeenCalledWith(10, 120n);

		expect(await controller.replay(event)).toBe('replayed');
		expect(service.replay).toHaveBeenCalledWith(10, 120n, new Date('2026-10-07T00:00:00Z'));
	});

	it('본문은 받은 Content-Type으로 reply에 직접 보낸다. 없으면 octet-stream', async () => {
		const reply = { header: vi.fn().mockReturnThis(), send: vi.fn() };
		await controller.body(event, reply);
		expect(service.body).toHaveBeenCalledWith(10, 120n);
		expect(reply.header).toHaveBeenCalledWith('content-type', 'application/json');
		expect(reply.send).toHaveBeenCalledWith(Buffer.from('{}'));

		service.body.mockResolvedValueOnce({ body: Buffer.alloc(0), content_type: null });
		await controller.body(event, reply);
		expect(reply.header).toHaveBeenLastCalledWith('content-type', 'application/octet-stream');
	});
});
