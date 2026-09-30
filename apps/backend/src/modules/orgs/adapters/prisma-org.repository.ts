import { Injectable } from '@nestjs/common';
import type { organization } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { OrgRepository, OrgWithRole } from '../ports/org.repository';

@Injectable()
export class PrismaOrgRepository implements OrgRepository {
	constructor(private readonly prisma: PrismaService) {}

	async listByMember(userId: number, cursor: number | null, take: number): Promise<OrgWithRole[]> {
		const members = await this.prisma.organization_member.findMany({
			where: { user_id: userId, ...(cursor === null ? {} : { organization_id: { lt: cursor } }) },
			orderBy: { organization_id: 'desc' },
			take,
			include: { organization: true },
		});
		return members.map((m) => ({ ...m.organization, role: m.role }));
	}

	findById(id: number): Promise<organization | null> {
		return this.prisma.organization.findUnique({ where: { id } });
	}

	update(id: number, data: { name?: string }): Promise<organization> {
		return this.prisma.organization.update({ where: { id }, data });
	}
}
