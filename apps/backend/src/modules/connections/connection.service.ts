import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { connection } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { CONNECTION_REPOSITORY, type ConnectionFilter, type ConnectionRepository } from './ports/connection.repository';

const NOT_FOUND = { code: 'connection_not_found', message: '연결이 없습니다.' };

@Injectable()
export class ConnectionService {
	constructor(@Inject(CONNECTION_REPOSITORY) private readonly connections: ConnectionRepository) {}

	async create(projectId: number, input: { source_id: number; destination_id: number }): Promise<connection> {
		const created = await this.connections.create(projectId, input.source_id, input.destination_id);
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

	async remove(projectId: number, id: number): Promise<void> {
		if (!(await this.connections.remove(projectId, id))) this.notFound();
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
