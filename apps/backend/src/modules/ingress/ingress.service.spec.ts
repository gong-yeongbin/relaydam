import { createHash, createHmac } from 'node:crypto';
import { type HttpException, Logger } from '@nestjs/common';
import { signatureConfigSchema } from '@/modules/sources/domain/signature-config';
import { usagePeriod } from './domain/usage-period';
import { INGRESS_BODY_LIMIT } from '@/common/http/ingress-body';
import { IngressService } from './ingress.service';
import type { DeliveryQueue } from './ports/delivery.queue';
import type { IngressCounters } from './ports/ingress.counters';
import type { IngressRepository, IngressSource, NewEvent, Rejection } from './ports/ingress.repository';

const SLUG = 'k3x9q2m7w1pz8c4v6b0n';
const NOW = new Date('2026-10-02T03:00:00Z');
const ORG = 1;
const SECRET = 'shared-secret';
// 경로·쿼리 없이 온 평범한 POST
const POST = { method: 'POST', path: '', query: '', source_ip: '203.0.113.7' };

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeRepository implements IngressRepository {
	source: IngressSource | null = {
		id: 7,
		project_id: 10,
		organization_id: ORG,
		plan: 'team',
		suspended: false,
		signing_secret: null,
		signature_config: null,
		connections: [
			{ id: 30, destination_id: 3 },
			{ id: 40, destination_id: 4 },
		],
	};
	lookups = 0;
	events: NewEvent[] = [];
	rejections: Rejection[] = [];

	findSourceBySlug() {
		this.lookups++;
		return Promise.resolve(this.source);
	}
	storeEvent(event: NewEvent) {
		const existing = this.events.findIndex((e) => e.source_id === event.source_id && e.idempotency_key === event.idempotency_key);
		if (existing >= 0) return Promise.resolve({ event_id: BigInt(existing + 1), delivery_ids: [], duplicate: true });
		this.events.push(event);
		const event_id = BigInt(this.events.length);
		return Promise.resolve({ event_id, delivery_ids: event.connections.map((c) => event_id * 100n + BigInt(c.destination_id)), duplicate: false });
	}
	recordRejection(rejection: Rejection) {
		this.rejections.push(rejection);
		return Promise.resolve();
	}
}

class FakeCounters implements IngressCounters {
	usage = new Map<string, number>();
	rejectionRecordAllowed = true;

	incrementUsage(organizationId: number, period: string) {
		const key = `${organizationId}:${period}`;
		const count = (this.usage.get(key) ?? 0) + 1;
		this.usage.set(key, count);
		return Promise.resolve(count);
	}
	allowRejectionRecord() {
		return Promise.resolve(this.rejectionRecordAllowed);
	}
}

class FakeQueue implements DeliveryQueue {
	enqueued: bigint[] = [];
	fail = false;

	enqueue(deliveryIds: bigint[]) {
		if (this.fail) return Promise.reject(new Error('valkey down'));
		this.enqueued.push(...deliveryIds);
		return Promise.resolve();
	}
}

async function errorOf(promise: Promise<unknown>) {
	const error = (await promise.catch((e: unknown) => e)) as HttpException;
	return { status: error.getStatus(), code: (error.getResponse() as { code: string }).code };
}

describe('IngressService', () => {
	let repository: FakeRepository;
	let counters: FakeCounters;
	let queue: FakeQueue;
	let service: IngressService;
	const usageKey = `${ORG}:${usagePeriod(NOW)}`;
	const receive = (body: string | Buffer = '{"order":1}', headers: Record<string, string | undefined> = { 'content-type': 'application/json' }, slug = SLUG) =>
		service.receive({ slug, ...POST, headers, body: Buffer.from(body), size: Buffer.byteLength(body), now: NOW });
	// 상한을 넘는 본문은 읽지 않고 온다. body는 비어 있고 size만 선언된 크기다
	const receiveOversize = (size = INGRESS_BODY_LIMIT + 1) =>
		service.receive({ slug: SLUG, ...POST, headers: { 'content-type': 'application/json' }, body: Buffer.alloc(0), size, now: NOW });

	beforeEach(() => {
		repository = new FakeRepository();
		counters = new FakeCounters();
		queue = new FakeQueue();
		service = new IngressService(repository, counters, queue);
	});

	it('받은 웹훅을 저장하고 연결된 목적지마다 전달할 일을 큐에 넣는다', async () => {
		const body = '{"order":1}';
		expect(await receive(body, { 'content-type': 'application/json', 'x-toss': 'a', 'x-none': undefined })).toEqual({ id: 1n });

		expect(repository.events).toEqual([
			{
				project_id: 10,
				source_id: 7,
				idempotency_key: `sha256:${createHash('sha256').update(`POST ?\n${body}`).digest('hex')}`,
				method: 'POST',
				path: '',
				query: '',
				source_ip: '203.0.113.7',
				verified: false,
				// undefined인 헤더는 저장하지 않는다
				headers: { 'content-type': 'application/json', 'x-toss': 'a' },
				body: Buffer.from(body),
				content_type: 'application/json',
				connections: [
					{ id: 30, destination_id: 3 },
					{ id: 40, destination_id: 4 },
				],
			},
		]);
		expect(queue.enqueued).toEqual([103n, 104n]);
		expect(counters.usage.get(usageKey)).toBe(1);
		expect(repository.rejections).toEqual([]);
	});

	it('PUT·PATCH·DELETE도 받고, 요청 방식·경로·쿼리·보낸 쪽 IP를 저장한다', async () => {
		for (const method of ['PUT', 'PATCH', 'DELETE']) {
			await service.receive({ slug: SLUG, method, path: '/orders/42', query: 'v=2&x=1', source_ip: '198.51.100.9', headers: {}, body: Buffer.from(method), size: method.length, now: NOW });
		}
		expect(repository.events.map((e) => [e.method, e.path, e.query, e.source_ip])).toEqual([
			['PUT', '/orders/42', 'v=2&x=1', '198.51.100.9'],
			['PATCH', '/orders/42', 'v=2&x=1', '198.51.100.9'],
			['DELETE', '/orders/42', 'v=2&x=1', '198.51.100.9'],
		]);
	});

	it('GET·HEAD 같은 다른 방식은 DB를 보지 않고 405 method_not_allowed', async () => {
		for (const method of ['GET', 'HEAD', 'OPTIONS']) {
			const call = service.receive({ slug: SLUG, method, path: '', query: '', source_ip: null, headers: {}, body: Buffer.alloc(0), size: 0, now: NOW });
			expect(await errorOf(call)).toEqual({ status: 405, code: 'method_not_allowed' });
		}
		expect(repository.lookups).toBe(0);
		expect(repository.rejections).toEqual([]);
	});

	it('본문이 같아도 경로가 다르면 다른 웹훅으로 저장한다', async () => {
		const send = (path: string) => service.receive({ slug: SLUG, ...POST, path, headers: {}, body: Buffer.from('{}'), size: 2, now: NOW });
		expect(await send('/a')).toEqual({ id: 1n });
		expect(await send('/b')).toEqual({ id: 2n });
		expect(await send('/a')).toEqual({ id: 1n });
	});

	it('Content-Type이 없으면 null로 저장한다', async () => {
		await receive('a=1', {});
		expect(repository.events[0]!.content_type).toBeNull();
	});

	it('같은 웹훅이 다시 오면 처음 이벤트의 id를 주고 새로 저장하거나 큐에 넣지 않는다. 사용량은 센다', async () => {
		const first = await receive('{"order":1}');
		const again = await receive('{"order":1}', { 'content-type': 'application/json', 'x-retry': '2' });

		expect(again).toEqual(first);
		expect(repository.events).toHaveLength(1);
		expect(queue.enqueued).toHaveLength(2);
		expect(counters.usage.get(usageKey)).toBe(2);

		await receive('{"order":2}');
		expect(repository.events).toHaveLength(2);
	});

	it('모양이 다른 slug는 DB를 보지 않고 404, 없는 slug도 404 source_not_found', async () => {
		for (const bad of ['short', 'K3X9Q2M7W1PZ8C4V6B0N', `${SLUG}x`, "'; drop table--x"]) {
			expect(await errorOf(receive('{}', {}, bad))).toEqual({ status: 404, code: 'source_not_found' });
		}
		expect(repository.lookups).toBe(0);

		repository.source = null;
		expect(await errorOf(receive())).toEqual({ status: 404, code: 'source_not_found' });
		expect(repository.lookups).toBe(1);
	});

	describe('거부 — 사유를 기록하고, 저장하지 않고, 사용량에 넣지 않는다', () => {
		const expectRejected = (reason: string) => {
			expect(repository.rejections).toEqual([{ project_id: 10, source_id: 7, reason, headers: { 'content-type': 'application/json' }, size: expect.any(Number) as number }]);
			expect(repository.events).toEqual([]);
			expect(queue.enqueued).toEqual([]);
			expect(counters.usage.size).toBe(0);
		};

		it('정지된 프로젝트는 403 project_suspended', async () => {
			repository.source!.suspended = true;
			expect(await errorOf(receive())).toEqual({ status: 403, code: 'project_suspended' });
			expectRejected('project_suspended');
		});

		it('연결된 목적지가 없으면 409 no_connection', async () => {
			repository.source!.connections = [];
			expect(await errorOf(receive())).toEqual({ status: 409, code: 'no_connection' });
			expectRejected('no_connection');
		});

		it('본문이 10MiB를 넘으면 413 payload_too_large. 정확히 10MiB는 받는다. 기록에 본문은 없고 크기만 남는다', async () => {
			expect(await receive(Buffer.alloc(INGRESS_BODY_LIMIT))).toEqual({ id: 1n });
			repository.events = [];
			counters.usage.clear();
			queue.enqueued = [];

			expect(await errorOf(receiveOversize())).toEqual({ status: 413, code: 'payload_too_large' });
			expectRejected('payload_too_large');
			expect(repository.rejections[0]).toMatchObject({ size: INGRESS_BODY_LIMIT + 1 });
			expect(repository.rejections[0]).not.toHaveProperty('body');
		});

		it('정지 → 연결 없음 → 본문 크기 → 서명 순서로 본다', async () => {
			repository.source = { ...repository.source!, suspended: true, connections: [], signing_secret: SECRET, signature_config: signatureConfigSchema.parse({ header: 'x-signature' }) };

			expect((await errorOf(receiveOversize())).code).toBe('project_suspended');
			repository.source.suspended = false;
			expect((await errorOf(receiveOversize())).code).toBe('no_connection');
			repository.source.connections = [{ id: 30, destination_id: 3 }];
			expect((await errorOf(receiveOversize())).code).toBe('payload_too_large');
			expect((await errorOf(receive('{}'))).code).toBe('invalid_signature');
		});
	});

	describe('서명 검증이 켜진 소스', () => {
		const body = '{"order":1}';
		const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('hex');

		beforeEach(() => {
			repository.source = {
				...repository.source!,
				signing_secret: SECRET,
				signature_config: signatureConfigSchema.parse({ header: 'X-Signature', event_id_header: 'X-Event-Id' }),
			};
		});

		it('서명이 맞으면 받고, 이벤트 ID 헤더를 멱등 키로 쓴다', async () => {
			expect(await receive(body, { 'x-signature': sign(body), 'x-event-id': 'evt_1' })).toEqual({ id: 1n });
			expect(repository.events[0]!.idempotency_key).toBe('id:evt_1');
			expect(repository.events[0]!.verified).toBe(true);

			// 본문이 달라도 이벤트 ID가 같으면 같은 웹훅이다
			const other = '{"order":1,"retry":true}';
			expect(await receive(other, { 'x-signature': sign(other), 'x-event-id': 'evt_1' })).toEqual({ id: 1n });
			expect(repository.events).toHaveLength(1);
		});

		it('서명 헤더가 없거나 틀리면 401 invalid_signature. 세부 사유는 기록에만 남는다', async () => {
			expect(await errorOf(receive(body, {}))).toEqual({ status: 401, code: 'invalid_signature' });
			expect(await errorOf(receive(body, { 'x-signature': sign('other body') }))).toEqual({ status: 401, code: 'invalid_signature' });

			expect(repository.rejections.map((r) => r.reason)).toEqual(['signature_missing', 'signature_mismatch']);
			expect(repository.events).toEqual([]);
			expect(counters.usage.size).toBe(0);
		});

		it('시각이 허용 오차 밖이면 401이고 사유는 timestamp_out_of_range', async () => {
			repository.source!.signature_config = signatureConfigSchema.parse({ header: 'x-signature', timestamp_header: 'x-timestamp', tolerance_sec: 60 });
			const old = String(Math.floor(NOW.getTime() / 1000) - 61);

			expect((await errorOf(receive(body, { 'x-signature': sign(body), 'x-timestamp': old }))).code).toBe('invalid_signature');
			expect(repository.rejections[0]!.reason).toBe('timestamp_out_of_range');
		});
	});

	describe('free 월 사용량', () => {
		it('1,000건까지 받고 1,001번째는 429 usage_exceeded. 저장하지 않는다', async () => {
			repository.source!.plan = 'free';
			counters.usage.set(usageKey, 999);

			expect(await receive('{"n":1000}')).toEqual({ id: 1n });
			expect(await errorOf(receive('{"n":1001}'))).toEqual({ status: 429, code: 'usage_exceeded' });

			expect(repository.events).toHaveLength(1);
			expect(repository.rejections.map((r) => r.reason)).toEqual(['usage_exceeded']);
		});

		it('유료는 포함량을 넘어도 받는다', async () => {
			counters.usage.set(usageKey, 10_000);
			expect(await receive()).toEqual({ id: 1n });
		});

		it('달이 바뀌면 새 카운터로 센다', async () => {
			await receive('{"n":1}');
			await service.receive({ slug: SLUG, ...POST, headers: {}, body: Buffer.from('{"n":2}'), size: 7, now: new Date('2026-11-01T00:00:00+09:00') });
			expect([...counters.usage.entries()]).toEqual([
				[`${ORG}:202610`, 1],
				[`${ORG}:202611`, 1],
			]);
		});
	});

	it('거부 기록이 분당 상한을 넘으면 기록은 건너뛰지만 거부는 그대로 한다', async () => {
		repository.source!.connections = [];
		counters.rejectionRecordAllowed = false;

		expect(await errorOf(receive())).toEqual({ status: 409, code: 'no_connection' });
		expect(repository.rejections).toEqual([]);
	});

	it('큐 적재가 실패해도 저장은 끝났으므로 받은 것으로 답하고 오류를 남긴다', async () => {
		const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		queue.fail = true;

		expect(await receive()).toEqual({ id: 1n });
		expect(repository.events).toHaveLength(1);
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('103, 104'));
		logged.mockRestore();
	});
});
