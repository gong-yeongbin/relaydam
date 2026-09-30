import { Injectable } from '@nestjs/common';
import type { MemberRole, organization_member } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { MemberRepository, MemberWithUser } from '../ports/member.repository';

const WITH_USER = { user: { select: { id: true, email: true, name: true, avatar_url: true } } } as const;

@Injectable()
export class PrismaMemberRepository implements MemberRepository {
	constructor(private readonly prisma: PrismaService) {}

	list(orgId: number, cursor: number | null, take: number): Promise<MemberWithUser[]> {
		return this.prisma.organization_member.findMany({
			where: { organization_id: orgId, ...(cursor === null ? {} : { user_id: { lt: cursor } }) },
			orderBy: { user_id: 'desc' },
			take,
			include: WITH_USER,
		});
	}

	find(orgId: number, userId: number): Promise<organization_member | null> {
		return this.prisma.organization_member.findUnique({ where: { organization_id_user_id: { organization_id: orgId, user_id: userId } } });
	}

	updateRole(orgId: number, userId: number, role: MemberRole): Promise<MemberWithUser> {
		return this.prisma.organization_member.update({
			where: { organization_id_user_id: { organization_id: orgId, user_id: userId } },
			data: { role },
			include: WITH_USER,
		});
	}

	async remove(orgId: number, userId: number): Promise<void> {
		await this.prisma.organization_member.delete({ where: { organization_id_user_id: { organization_id: orgId, user_id: userId } } });
	}
}
