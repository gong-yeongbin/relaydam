import { Inject, Injectable } from '@nestjs/common';
import type { rejected_request } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { REJECTED_REQUEST_REPOSITORY, type RejectedRequestFilter, type RejectedRequestRepository } from './ports/rejected-request.repository';

@Injectable()
export class RejectedRequestService {
	constructor(@Inject(REJECTED_REQUEST_REPOSITORY) private readonly rejections: RejectedRequestRepository) {}

	async list(projectId: number, query: ListQueryDto & RejectedRequestFilter): Promise<Page<rejected_request>> {
		const filter = { source_id: query.source_id, reason: query.reason };
		const cursor = query.cursor === undefined ? null : BigInt(query.cursor);
		return toPage(await this.rejections.list(projectId, filter, cursor, query.limit + 1), query.limit, (r) => r.id);
	}
}
