import { Inject, Injectable } from '@nestjs/common';
import { deliveryHeaders, deliveryUrl, signBody } from './domain/delivery-request';
import { nextAttemptAt, willRetryAfterSec } from './domain/retry-schedule';
import { DELIVERY_QUEUE, type DeliveryQueue, type QueuedDelivery } from './ports/delivery.queue';
import { APP_URL, DELIVERY_REPOSITORY, type DeliveryRepository } from './ports/delivery.repository';
import { DESTINATION_CLIENT, type DestinationClient, type DestinationRequest, type DestinationResponse } from './ports/destination.client';
import { DESTINATION_GUARD, type DestinationGuard } from './ports/destination.guard';

// 처리 결과. skipped는 손댈 것이 없었다는 뜻이다(지워졌거나, 이미 끝났거나, 다른 워커가 먼저 처리했다).
// deferred는 목적지 자리가 없거나 서킷이 열려 보내지 않고 뒤로 미룬 것이다
export type WorkResult = 'succeeded' | 'failed' | 'dead' | 'held' | 'canceled' | 'skipped' | 'deferred';

// 자리가 없거나 프로브를 기다릴 때 다시 보는 간격. 1~5초 사이로 흩뜨려 한꺼번에 몰리지 않게 한다
const DEFER_MIN_MS = 1_000;
const DEFER_SPREAD_MS = 4_000;
// 잡은 자리를 목적지 타임아웃보다 이만큼 더 둔다. 응답을 받고 자리를 놓기까지의 여유다
const SLOT_GRACE_MS = 5_000;

// delivery 하나를 목적지로 보내고 결과를 남긴다. at-least-once다. 같은 delivery가 두 번 전달될 수 있다
@Injectable()
export class DeliveryWorker {
	constructor(
		@Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
		@Inject(DESTINATION_CLIENT) private readonly client: DestinationClient,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
		@Inject(DESTINATION_GUARD) private readonly guard: DestinationGuard,
		@Inject(APP_URL) private readonly appUrl: string,
	) {}

	// random은 재시도 간격을 흩뜨리는 값(0 이상 1 미만)
	async process(item: QueuedDelivery, now: Date, random: number): Promise<WorkResult> {
		const delivery = await this.deliveries.load(item.delivery_id);
		if (!delivery || (delivery.status !== 'pending' && delivery.status !== 'failed')) return 'skipped';

		const { event, project, destination, connection } = delivery;
		// 목적지나 연결이 지워졌다. 보낼 곳이 없다
		if (!destination || !connection) {
			await this.deliveries.close(delivery.id, 'canceled');
			return 'canceled';
		}
		// 정지된 project, 일시 정지한 연결. 시도 횟수를 쓰지 않고 둔다. 풀리면 다시 큐에 들어온다
		if (project.suspended || connection.paused) {
			await this.deliveries.close(delivery.id, 'held');
			return 'held';
		}

		// 서킷이 열려 있으면 풀릴 때까지, half_open인데 프로브를 다른 워커가 잡았으면 잠깐 미룬다. 시도 횟수를 쓰지 않는다
		const circuit = await this.guard.circuit(destination.id);
		if (circuit.state === 'open') return this.defer(delivery.id, now, circuit.remaining_ms, random);
		if (circuit.state === 'half_open' && !circuit.probe) return this.defer(delivery.id, now, 0, random);
		// 목적지의 동시 전달 자리를 잡는다. 꽉 찼으면 잠깐 미룬다
		const slot = await this.guard.acquire(destination.id, destination.concurrency, destination.timeout_ms + SLOT_GRACE_MS);
		if (slot === null) return this.defer(delivery.id, now, 0, random);

		const attemptNo = delivery.attempt + 1;
		const trigger = item.trigger ?? (delivery.attempt === 0 ? 'initial' : 'automatic');
		const response = await this.send(destination.id, slot, {
			method: event.method,
			url: deliveryUrl(destination.url, event.path, event.query),
			headers: deliveryHeaders(event.headers, destination.headers, {
				event_id: event.id,
				delivery_id: delivery.id,
				attempt_count: attemptNo,
				trigger,
				// 이번 시도까지 실패하면 재시도는 delivery.attempt번 한 셈이다(첫 시도 제외)
				will_retry_after_sec: willRetryAfterSec(connection, delivery.attempt),
				event_url: `${this.appUrl}/orgs/${project.organization_id}/projects/${project.id}/events/${event.id}`,
				source_name: event.source_name,
				destination_name: destination.name,
				original_ip: event.source_ip,
				signature: signBody(project.signing_secret, event.body),
				verified: event.verified,
			}),
			body: event.body,
			timeout_ms: destination.timeout_ms,
		});

		const statusCode = 'status_code' in response ? response.status_code : null;
		const error = 'error' in response ? response.error : null;
		const attempt = {
			attempt_no: attemptNo,
			trigger,
			status_code: statusCode,
			error,
			duration_ms: response.duration_ms,
			response_body: 'response_body' in response ? response.response_body : null,
		};

		// 2xx만 성공이다. 리다이렉트를 포함해 나머지는 전부 재시도한다
		if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
			await this.guard.recordSuccess(destination.id);
			const recorded = await this.deliveries.recordAttempt(delivery.id, delivery.attempt, attempt, { status: 'succeeded', next_attempt_at: null, last_status_code: statusCode, last_error: null });
			return recorded ? 'succeeded' : 'skipped';
		}

		await this.guard.recordFailure(destination.id);
		const retryAt = nextAttemptAt({
			rule: connection,
			retriesDone: delivery.attempt,
			firstAttemptAt: delivery.created_at,
			now,
			retryAfter: 'retry_after' in response ? response.retry_after : undefined,
			random,
		});
		const status = retryAt === null ? 'dead' : 'failed';
		const recorded = await this.deliveries.recordAttempt(delivery.id, delivery.attempt, attempt, { status, next_attempt_at: retryAt, last_status_code: statusCode, last_error: error });
		if (!recorded) return 'skipped';
		// 예약이 빠져도 failed로 남아 있으므로 sweeper가 다시 넣는다
		if (retryAt !== null) await this.queue.schedule(delivery.id, retryAt);
		return status;
	}

	// 보내고 나면 결과가 무엇이든 자리를 놓는다. client는 던지지 않지만, 던지더라도 자리가 남지 않게 한다
	private async send(destinationId: number, slot: string, request: DestinationRequest): Promise<DestinationResponse> {
		try {
			return await this.client.send(request);
		} finally {
			await this.guard.release(destinationId, slot);
		}
	}

	// 보내지 않고 waitMs + 1~5초 뒤로 미룬다. DB에도 적어 sweeper가 큐에 또 넣지 않게 한다
	private async defer(id: bigint, now: Date, waitMs: number, random: number): Promise<WorkResult> {
		const at = new Date(now.getTime() + waitMs + DEFER_MIN_MS + Math.round(DEFER_SPREAD_MS * random));
		await this.deliveries.defer(id, at);
		await this.queue.schedule(id, at);
		return 'deferred';
	}
}
