import { Injectable } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { MembershipRepository } from '../ports/membership.repository';

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findRole(organizationId: number, userId: number): Promise<MemberRole | null> {
		const member = await this.prisma.organization_member.findUnique({
			where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
			select: { role: true },
		});
		return member?.role ?? null;
	}
}
