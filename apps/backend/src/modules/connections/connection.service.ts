import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { connection } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { CONNECTION_REPOSITORY, type ConnectionFilter, type ConnectionRepository, type RetryRule } from './ports/connection.repository';
import { HELD_DELIVERIES, type HeldDeliveries } from './ports/held-deliveries';

const NOT_FOUND = { code: 'connection_not_found', message: '연결이 없습니다.' };

// DTO는 null을 "보내지 않음"과 같게 받는다(@IsOptional이 null을 통과시킨다)
type RetryInput = { [K in keyof RetryRule]?: RetryRule[K] | null };

const retryOf = (input: RetryInput): Partial<RetryRule> => ({
	retry_strategy: input.retry_strategy ?? undefined,
	retry_interval_ms: input.retry_interval_ms ?? undefined,
	retry_count: input.retry_count ?? undefined,
});

@Injectable()
export class ConnectionService {
	constructor(
		@Inject(CONNECTION_REPOSITORY) private readonly connections: ConnectionRepository,
		@Inject(HELD_DELIVERIES) private readonly held: HeldDeliveries,
	) {}

	async create(projectId: number, input: { source_id: number; destination_id: number } & RetryInput): Promise<connection> {
		const created = await this.connections.create(projectId, input.source_id, input.destination_id, retryOf(input));
		// 다른 project의 소스·목적지도 "없다"로 답한다. 존재 여부를 노출하지 않는다
		if (created === 'source_not_found') throw new NotFoundException({ code: 'source_not_found', message: '소스가 없습니다.' });
		if (created === 'destination_not_found') throw new NotFoundException({ code: 'destination_not_found', message: '목적지가 없습니다.' });
		if (created === 'conflict') throw new ConflictException({ code: 'connection_conflict', message: '이미 이어진 소스와 목적지입니다.' });
		return created;
	}

	async list(projectId: number, query: ListQueryDto & ConnectionFilter): Promise<Page<connection>> {
		const filter = { source_id: query.source_id, destination_id: query.destination_id };
		return toPage(await this.connections.list(projectId, filter, query.cursor ?? null, query.limit + 1), query.limit, (c) => c.id);
	}

	async get(projectId: number, id: number): Promise<connection> {
		return (await this.connections.find(projectId, id)) ?? this.notFound();
	}

	// 재시도 설정을 바꾼다. 보내지 않은 필드는 그대로 둔다. 이미 예약된 재시도의 시각은 바뀌지 않는다
	async update(projectId: number, id: number, input: RetryInput): Promise<connection> {
		return (await this.connections.update(projectId, id, retryOf(input))) ?? this.notFound();
	}

	// 전달을 멈춘다. 그동안 웹훅은 받아 저장하고 전달만 보류한다. 이미 멈춰 있으면 멈춘 시각을 그대로 둔다
	async pause(projectId: number, id: number, now: Date): Promise<connection> {
		const current = await this.get(projectId, id);
		if (current.paused_at !== null) return current;
		return (await this.connections.update(projectId, id, { paused_at: now })) ?? this.notFound();
	}

	// 다시 전달한다. 멈춘 동안 보류해 둔 전달을 큐에 넣어 이어서 보낸다
	async unpause(projectId: number, id: number): Promise<connection> {
		const unpaused = (await this.connections.update(projectId, id, { paused_at: null })) ?? this.notFound();
		await this.held.release(id);
		return unpaused;
	}

	async remove(projectId: number, id: number): Promise<void> {
		if (!(await this.connections.remove(projectId, id))) this.notFound();
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
