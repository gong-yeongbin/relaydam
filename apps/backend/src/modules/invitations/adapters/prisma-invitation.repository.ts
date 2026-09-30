import { Injectable } from '@nestjs/common';
import type { InvitationRole, invitation, organization_member } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { InvitationRepository, InvitationView, InviteContext } from '../ports/invitation.repository';

// token_hash는 응답에 나가지 않도록 애초에 읽지 않는다
const VIEW = { id: true, organization_id: true, email: true, role: true, expires_at: true, invited_by_user_id: true, created_at: true, updated_at: true } as const;

@Injectable()
export class PrismaInvitationRepository implements InvitationRepository {
	constructor(private readonly prisma: PrismaService) {}

	async inviteContext(orgId: number, email: string, inviterId: number, now: Date): Promise<InviteContext> {
		const [org, pending, existing, inviter] = await Promise.all([
			this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true, plan: true, _count: { select: { members: true } } } }),
			this.prisma.invitation.count({ where: { organization_id: orgId, email: { not: email }, expires_at: { gt: now } } }),
			this.prisma.organization_member.findFirst({ where: { organization_id: orgId, user: { email: { equals: email, mode: 'insensitive' } } }, select: { user_id: true } }),
			this.prisma.user.findUniqueOrThrow({ where: { id: inviterId }, select: { name: true } }),
		]);
		return { org_name: org.name, plan: org.plan, member_count: org._count.members, pending_count: pending, already_member: existing !== null, inviter_name: inviter.name };
	}

	upsert(data: { organization_id: number; email: string; role: InvitationRole; token_hash: string; expires_at: Date; invited_by_user_id: number }): Promise<InvitationView> {
		const { organization_id, email, ...rest } = data;
		return this.prisma.invitation.upsert({
			where: { organization_id_email: { organization_id, email } },
			create: data,
			update: rest,
			select: VIEW,
		});
	}

	list(orgId: number, cursor: number | null, take: number): Promise<InvitationView[]> {
		return this.prisma.invitation.findMany({
			where: { organization_id: orgId, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
			select: VIEW,
		});
	}

	async remove(orgId: number, id: number): Promise<boolean> {
		// organization_id 조건으로 타 조직 초대 id는 지우지 않는다
		const { count } = await this.prisma.invitation.deleteMany({ where: { id, organization_id: orgId } });
		return count > 0;
	}

	findByTokenHash(tokenHash: string): Promise<invitation | null> {
		return this.prisma.invitation.findUnique({ where: { token_hash: tokenHash } });
	}

	async findUserEmail(userId: number): Promise<string | null> {
		const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
		return user?.email ?? null;
	}

	accept(inv: invitation, userId: number): Promise<organization_member> {
		return this.prisma.$transaction(async (tx) => {
			await tx.invitation.delete({ where: { id: inv.id } });
			const key = { organization_id_user_id: { organization_id: inv.organization_id, user_id: userId } };
			return (await tx.organization_member.findUnique({ where: key })) ?? tx.organization_member.create({ data: { organization_id: inv.organization_id, user_id: userId, role: inv.role } });
		});
	}
}
