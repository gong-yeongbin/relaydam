import {
	ConflictException,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	PayloadTooLargeException,
	UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, RejectionReason } from '@prisma/client';
import { INGRESS_BODY_LIMIT } from '@/common/http/ingress-body';
import { INCLUDED_EVENTS } from '@/common/plan-limits';
import { SLUG_LENGTH } from '@/modules/sources/domain/slug';
import { idempotencyKey } from './domain/idempotency';
import { type RequestHeaders, verifySignature } from './domain/signature';
import { usagePeriod } from './domain/usage-period';
import { DELIVERY_QUEUE, type DeliveryQueue } from './ports/delivery.queue';
import { INGRESS_COUNTERS, type IngressCounters } from './ports/ingress.counters';
import { INGRESS_REPOSITORY, type IngressRepository, type IngressSource } from './ports/ingress.repository';

const SLUG = new RegExp(`^[a-z0-9]{${SLUG_LENGTH}}$`);

// 발신자에게 주는 응답. 서명 실패의 세부 사유는 주지 않는다(거부 기록에만 남는다)
const INVALID_SIGNATURE = () => new UnauthorizedException({ code: 'invalid_signature', message: '서명이 올바르지 않습니다.' });
const RESPONSE: Record<RejectionReason, () => HttpException> = {
	project_suspended: () => new ForbiddenException({ code: 'project_suspended', message: '정지된 프로젝트입니다.' }),
	no_connection: () => new ConflictException({ code: 'no_connection', message: '연결된 목적지가 없습니다.' }),
	payload_too_large: () => new PayloadTooLargeException({ code: 'payload_too_large', message: '요청 본문이 너무 큽니다.' }),
	signature_missing: INVALID_SIGNATURE,
	signature_mismatch: INVALID_SIGNATURE,
	timestamp_out_of_range: INVALID_SIGNATURE,
	usage_exceeded: () => new HttpException({ code: 'usage_exceeded', message: '이번 달 무료 사용량을 넘었습니다.' }, HttpStatus.TOO_MANY_REQUESTS),
};

// size는 본문 크기다. 상한을 넘는 본문은 읽지 않으므로 그때 body는 비어 있고 size는 발신자가 선언한 크기다
export type IncomingWebhook = { slug: string; headers: RequestHeaders; body: Buffer; size: number; now: Date };

// Json 컬럼에는 undefined를 넣을 수 없다
function definedHeaders(headers: RequestHeaders): Prisma.InputJsonObject {
	return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
}

// 검증·저장·큐 적재만 한다. 외부 HTTP 호출을 하지 않는다
@Injectable()
export class IngressService {
	private readonly logger = new Logger(IngressService.name);

	constructor(
		@Inject(INGRESS_REPOSITORY) private readonly repository: IngressRepository,
		@Inject(INGRESS_COUNTERS) private readonly counters: IngressCounters,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
	) {}

	// 검사 순서는 "소스(정지·연결) → 본문 크기 → 서명 → 사용량 → 저장"이다. 사용량은 거부 판정이 끝난 뒤에만 올린다.
	// 근거는 context-notes.md "수신 정책과 삭제 정책"
	async receive(webhook: IncomingWebhook): Promise<{ id: bigint }> {
		// 모양이 다른 slug는 DB를 보지 않고 없는 주소로 답한다
		const source = SLUG.test(webhook.slug) ? await this.repository.findSourceBySlug(webhook.slug) : null;
		if (!source) throw new NotFoundException({ code: 'source_not_found', message: '소스가 없습니다.' });

		if (source.suspended) return this.reject(source, 'project_suspended', webhook);
		if (source.destination_ids.length === 0) return this.reject(source, 'no_connection', webhook);
		if (webhook.size > INGRESS_BODY_LIMIT) return this.reject(source, 'payload_too_large', webhook);

		if (source.signature_config && source.signing_secret !== null) {
			const verified = verifySignature({ config: source.signature_config, secret: source.signing_secret, headers: webhook.headers, body: webhook.body, now: webhook.now });
			if (verified !== 'ok') return this.reject(source, verified, webhook);
		}

		// 저장보다 먼저 올리므로 같은 웹훅이 다시 와도 센다
		const used = await this.counters.incrementUsage(source.organization_id, usagePeriod(webhook.now));
		if (source.plan === 'free' && used > INCLUDED_EVENTS.free) return this.reject(source, 'usage_exceeded', webhook);

		const contentType = webhook.headers['content-type'];
		const stored = await this.repository.storeEvent({
			project_id: source.project_id,
			source_id: source.id,
			idempotency_key: idempotencyKey(source.signature_config?.event_id_header, webhook.headers, webhook.body),
			headers: definedHeaders(webhook.headers),
			body: webhook.body,
			content_type: typeof contentType === 'string' ? contentType : null,
			destination_ids: source.destination_ids,
		});
		if (!stored.duplicate) await this.enqueue(stored.delivery_ids);
		return { id: stored.event_id };
	}

	// 저장은 끝났으므로 큐 적재가 실패해도 받은 것으로 답한다. 큐에 못 들어간 delivery는 sweeper(8. delivery)가 다시 넣는다
	private async enqueue(deliveryIds: bigint[]): Promise<void> {
		try {
			await this.queue.enqueue(deliveryIds);
		} catch (error) {
			this.logger.error(`delivery ${deliveryIds.join(', ')} 큐 적재 실패: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// 거부 사유를 기록하고(소스당 분당 상한 안에서만) 발신자에게 오류로 답한다
	private async reject(source: IngressSource, reason: RejectionReason, webhook: IncomingWebhook): Promise<never> {
		if (await this.counters.allowRejectionRecord(source.id, webhook.now)) {
			await this.repository.recordRejection({
				project_id: source.project_id,
				source_id: source.id,
				reason,
				headers: definedHeaders(webhook.headers),
				size: webhook.size,
			});
		}
		throw RESPONSE[reason]();
	}
}
