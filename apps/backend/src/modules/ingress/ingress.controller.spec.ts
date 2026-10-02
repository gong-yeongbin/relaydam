import { IngressController } from './ingress.controller';
import type { IngressService } from './ingress.service';

describe('IngressController', () => {
	afterEach(() => vi.useRealTimers());

	it('slug·헤더·본문을 service에 넘긴다. Content-Type은 원래 값으로 되돌린다', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-02T00:00:00Z') });
		const service = { receive: vi.fn().mockResolvedValue({ id: 1n }) };
		const controller = new IngressController(service as unknown as IngressService);
		const body = Buffer.from('{"a":1}');

		const result = await controller.receive('k3x9q2m7w1pz8c4v6b0n', {
			headers: { 'content-type': 'application/octet-stream', 'x-toss': 'a' },
			body,
			originalContentType: 'application/json',
		});

		expect(result).toEqual({ id: 1n });
		expect(service.receive).toHaveBeenCalledWith({
			slug: 'k3x9q2m7w1pz8c4v6b0n',
			headers: { 'content-type': 'application/json', 'x-toss': 'a' },
			body,
			now: new Date('2026-10-02T00:00:00Z'),
		});
	});
});
