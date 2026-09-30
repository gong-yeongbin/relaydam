import { Injectable } from '@nestjs/common';
import { Prisma, type project } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { CreateCheck, ProjectRepository } from '../ports/project.repository';

// 이름 유니크는 식 인덱스 project_organization_id_lower_name_key(마이그레이션 SQL)가 강제한다
const isNameConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
	constructor(private readonly prisma: PrismaService) {}

	async create(orgId: number, name: string, check: CreateCheck): Promise<project | 'name_conflict'> {
		try {
			return await this.prisma.$transaction(async (tx) => {
				// 같은 조직의 생성·초대를 줄 세운다. 개수를 센 뒤 만들기 전에 다른 요청이 끼어들지 못한다
				await tx.$queryRaw`SELECT id FROM organization WHERE id = ${orgId} FOR UPDATE`;
				const [org, count] = await Promise.all([
					tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } }),
					tx.project.count({ where: { organization_id: orgId } }),
				]);
				check({ plan: org.plan, count });
				return tx.project.create({ data: { organization_id: orgId, name } });
			});
		} catch (e) {
			if (isNameConflict(e)) return 'name_conflict';
			throw e;
		}
	}

	list(orgId: number, cursor: number | null, take: number): Promise<project[]> {
		return this.prisma.project.findMany({
			where: { organization_id: orgId, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
		});
	}

	find(orgId: number, id: number): Promise<project | null> {
		return this.prisma.project.findFirst({ where: { id, organization_id: orgId } });
	}

	async update(orgId: number, id: number, data: { name?: string }): Promise<project | null | 'name_conflict'> {
		try {
			const { count } = await this.prisma.project.updateMany({ where: { id, organization_id: orgId }, data });
			return count > 0 ? this.find(orgId, id) : null;
		} catch (e) {
			if (isNameConflict(e)) return 'name_conflict';
			throw e;
		}
	}

	async remove(orgId: number, id: number): Promise<boolean> {
		const { count } = await this.prisma.project.deleteMany({ where: { id, organization_id: orgId } });
		return count > 0;
	}
}
