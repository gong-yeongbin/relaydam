import { Injectable } from '@nestjs/common';
import type { rejected_request } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { RejectedRequestFilter, RejectedRequestRepository } from '../ports/rejected-request.repository';

@Injectable()
export class PrismaRejectedRequestRepository implements RejectedRequestRepository {
	constructor(private readonly prisma: PrismaService) {}

	list(projectId: number, filter: RejectedRequestFilter, cursor: bigint | null, take: number): Promise<rejected_request[]> {
		return this.prisma.rejected_request.findMany({
			where: { project_id: projectId, source_id: filter.source_id, reason: filter.reason, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
		});
	}
}
