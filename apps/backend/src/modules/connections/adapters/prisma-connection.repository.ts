import { Injectable } from '@nestjs/common';
import { type connection, Prisma } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { ConnectionFilter, ConnectionRepository } from '../ports/connection.repository';

// 한 쌍 유니크(connection_source_id_destination_id_key)
const isConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class PrismaConnectionRepository implements ConnectionRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(projectId: number, sourceId: number, destinationId: number): Promise<connection | 'source_not_found' | 'destination_not_found' | 'conflict'> {
		const [sources, destinations] = await Promise.all([
			this.prisma.source.count({ where: { id: sourceId, project_id: projectId } }),
			this.prisma.destination.count({ where: { id: destinationId, project_id: projectId } }),
		]);
		if (sources === 0) return 'source_not_found';
		if (destinations === 0) return 'destination_not_found';
		try {
			return await this.prisma.connection.create({ data: { source_id: sourceId, destination_id: destinationId } });
		} catch (e) {
			if (isConflict(e)) return 'conflict';
			throw e;
		}
	}

	list(projectId: number, filter: ConnectionFilter, cursor: number | null, take: number): Promise<connection[]> {
		return this.prisma.connection.findMany({
			where: {
				source: { project_id: projectId },
				source_id: filter.source_id,
				destination_id: filter.destination_id,
				...(cursor === null ? {} : { id: { lt: cursor } }),
			},
			orderBy: { id: 'desc' },
			take,
		});
	}

	find(projectId: number, id: number): Promise<connection | null> {
		return this.prisma.connection.findFirst({ where: { id, source: { project_id: projectId } } });
	}

	async remove(projectId: number, id: number): Promise<boolean> {
		const { count } = await this.prisma.connection.deleteMany({ where: { id, source: { project_id: projectId } } });
		return count > 0;
	}
}
