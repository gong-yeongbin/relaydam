import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { delivery } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { type BulkRetryFilter, DELIVERY_API_REPOSITORY, type DeliveryApiRepository, type DeliveryDetail, type DeliveryFilter } from './ports/delivery-api.repository';
import { DELIVERY_QUEUE, type DeliveryQueue } from './ports/delivery.queue';

const NOT_FOUND = { code: 'delivery_not_found', message: '전달이 없습니다.' };
// 일괄 재시도 한 번에 돌리는 최대 수. 더 있으면 다시 부른다
export const BULK_RETRY_LIMIT = 1_000;

// 관리 API. 조회와 수동 재시도·취소. 보내는 일은 워커(delivery.worker.ts)가 한다
@Injectable()
export class DeliveryService {
	constructor(
		@Inject(DELIVERY_API_REPOSITORY) private readonly deliveries: DeliveryApiRepository,
		@Inject(DELIVERY_QUEUE) private readonly queue: DeliveryQueue,
	) {}

	async list(projectId: number, query: ListQueryDto & Omit<DeliveryFilter, 'event_id'> & { event_id?: string }): Promise<Page<delivery>> {
		const filter = { status: query.status, destination_id: query.destination_id, event_id: query.event_id === undefined ? undefined : BigInt(query.event_id) };
		const cursor = query.cursor === undefined ? null : BigInt(query.cursor);
		return toPage(await this.deliveries.list(projectId, filter, cursor, query.limit + 1), query.limit, (d) => d.id);
	}

	async get(projectId: number, id: bigint): Promise<DeliveryDetail> {
		return (await this.deliveries.find(projectId, id)) ?? this.notFound();
	}

	// 같은 delivery에 시도를 하나 더한다. 횟수는 이어진다. 처리 중인 것만 막고 끝난 것(성공 포함)은 다시 보낼 수 있다.
	// 예정돼 있던 자동 재시도는 지운다. 안 지우면 그 시각에 한 번 더 간다
	async retry(projectId: number, id: bigint): Promise<delivery> {
		const marked = await this.deliveries.markRetry(projectId, id);
		if (marked === 'not_found') this.notFound();
		if (marked === 'pending') throw new ConflictException({ code: 'delivery_pending', message: '처리 중인 전달입니다.' });
		await this.queue.unschedule([id]);
		await this.queue.enqueue([{ delivery_id: id, trigger: 'manual' }]);
		return marked;
	}

	// 조건에 맞는 것을 한 번에 최대 1,000건 다시 보낸다. 돌린 수를 준다
	async bulkRetry(projectId: number, filter: BulkRetryFilter): Promise<{ count: number }> {
		const ids = await this.deliveries.markBulkRetry(projectId, filter, BULK_RETRY_LIMIT);
		if (ids.length > 0) {
			await this.queue.unschedule(ids);
			await this.queue.enqueue(ids.map((delivery_id) => ({ delivery_id, trigger: 'bulk_retry' as const })));
		}
		return { count: ids.length };
	}

	// 예정된 자동 재시도를 멈추고 canceled로 닫는다. 이미 끝난 것은 취소할 게 없다
	async cancel(projectId: number, id: bigint): Promise<delivery> {
		const canceled = await this.deliveries.cancel(projectId, id);
		if (canceled === 'not_found') this.notFound();
		if (canceled === 'closed') throw new ConflictException({ code: 'delivery_closed', message: '이미 끝난 전달입니다.' });
		await this.queue.unschedule([id]);
		return canceled;
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
