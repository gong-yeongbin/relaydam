import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { MembershipRepository, OrgAccess } from '../ports/membership.repository';

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAccess(organizationId: number, userId: number): Promise<OrgAccess | null> {
		const member = await this.prisma.organization_member.findUnique({
			where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
			select: { role: true, organization: { select: { plan: true, _count: { select: { members: true } } } } },
		});
		if (!member) return null;
		return { role: member.role, plan: member.organization.plan, member_count: member.organization._count.members };
	}

	async projectInOrg(projectId: number, organizationId: number): Promise<boolean> {
		return (await this.prisma.project.count({ where: { id: projectId, organization_id: organizationId } })) > 0;
	}
}
