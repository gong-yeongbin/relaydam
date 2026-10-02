import { IngressController } from './ingress.controller';
import type { IngressService } from './ingress.service';

describe('IngressController', () => {
	afterEach(() => vi.useRealTimers());

	it('slug·요청 방식·경로·쿼리·IP·헤더·본문·크기를 service에 넘긴다. Content-Type은 원래 값으로 되돌린다', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-02T00:00:00Z') });
		const service = { receive: vi.fn().mockResolvedValue({ id: 1n }) };
		const controller = new IngressController(service as unknown as IngressService);
		const body = Buffer.from('{"a":1}');

		const result = await controller.receive('k3x9q2m7w1pz8c4v6b0n', {
			method: 'PUT',
			url: '/in/k3x9q2m7w1pz8c4v6b0n/orders/42?v=2&x=1',
			ip: '203.0.113.7',
			headers: { 'content-type': 'application/octet-stream', 'x-toss': 'a' },
			body,
			originalContentType: 'application/json',
		});

		expect(result).toEqual({ id: 1n });
		expect(service.receive).toHaveBeenCalledWith({
			slug: 'k3x9q2m7w1pz8c4v6b0n',
			method: 'PUT',
			path: '/orders/42',
			query: 'v=2&x=1',
			source_ip: '203.0.113.7',
			headers: { 'content-type': 'application/json', 'x-toss': 'a' },
			body,
			size: 7,
			now: new Date('2026-10-02T00:00:00Z'),
		});
	});

	it('상한을 넘어 읽지 않은 본문은 빈 Buffer와 선언된 크기로 넘긴다', async () => {
		const service = { receive: vi.fn().mockResolvedValue({ id: 1n }) };
		const controller = new IngressController(service as unknown as IngressService);

		await controller.receive('k3x9q2m7w1pz8c4v6b0n', { method: 'POST', url: '/in/k3x9q2m7w1pz8c4v6b0n', headers: { 'content-length': '0' }, originalContentType: 'application/json', declaredSize: 20_000_000 });

		expect(service.receive).toHaveBeenCalledWith(
			expect.objectContaining({ method: 'POST', path: '', query: '', source_ip: null, headers: { 'content-type': 'application/json', 'content-length': '20000000' }, body: Buffer.alloc(0), size: 20_000_000 }),
		);
	});
});
