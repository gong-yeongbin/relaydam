import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { organization_member } from '@prisma/client';
import type { Actor } from '@/common/auth/decorators';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { exceedsMemberLimit } from '@/common/plan-limits';
import { hashInvitationToken, invitationExpiresAt, invitationMail, sameEmail } from './domain/invitation';
import { APP_URL, INVITATION_REPOSITORY, type InvitationRepository, type InvitationView } from './ports/invitation.repository';
import { MAILER, type Mailer } from './ports/mailer';

const NOT_FOUND = { code: 'invitation_not_found', message: '초대가 없거나 만료됐습니다.' };

@Injectable()
export class InvitationService {
	constructor(
		@Inject(INVITATION_REPOSITORY) private readonly invitations: InvitationRepository,
		@Inject(MAILER) private readonly mailer: Mailer,
		@Inject(APP_URL) private readonly appUrl: string,
	) {}

	async create(actor: Actor, orgId: number, input: { email: string; role: 'admin' | 'member' }): Promise<InvitationView> {
		const email = input.email.toLowerCase();
		const now = new Date();
		const ctx = await this.invitations.inviteContext(orgId, email, actor.user_id, now);
		if (ctx.already_member) throw new ConflictException({ code: 'member_conflict', message: '이미 조직 멤버입니다.' });
		// 대기 중인 초대도 자리를 차지한다. 초대를 쌓아 두고 수락시켜 상한을 넘는 것을 막는다
		if (exceedsMemberLimit(ctx.plan, ctx.member_count + ctx.pending_count + 1)) {
			throw new ForbiddenException({ code: 'plan_limit', message: '멤버와 대기 중인 초대 수가 플랜 상한에 도달했습니다.' });
		}

		const token = randomBytes(32).toString('base64url');
		const expires_at = invitationExpiresAt(now);
		const invitation = await this.invitations.upsert({
			organization_id: orgId,
			email,
			role: input.role,
			token_hash: hashInvitationToken(token),
			expires_at,
			invited_by_user_id: actor.user_id,
		});
		// 발송이 실패하면 초대 행은 남는다. 같은 이메일로 다시 초대하면 새 토큰으로 재발송된다
		await this.mailer.send({
			to: email,
			...invitationMail({ org_name: ctx.org_name, inviter_name: ctx.inviter_name, accept_url: `${this.appUrl}/invitations/${token}`, expires_at }),
		});
		return invitation;
	}

	async list(orgId: number, query: ListQueryDto): Promise<Page<InvitationView>> {
		return toPage(await this.invitations.list(orgId, query.cursor ?? null, query.limit + 1), query.limit, (r) => r.id);
	}

	async cancel(orgId: number, id: number): Promise<void> {
		if (!(await this.invitations.remove(orgId, id))) throw new NotFoundException(NOT_FOUND);
	}

	async accept(actor: Actor, token: string): Promise<organization_member> {
		const invitation = await this.invitations.findByTokenHash(hashInvitationToken(token));
		if (!invitation || invitation.expires_at <= new Date()) throw new NotFoundException(NOT_FOUND);

		const email = await this.invitations.findUserEmail(actor.user_id);
		if (!email || !sameEmail(email, invitation.email)) {
			throw new ForbiddenException({ code: 'forbidden', message: '초대받은 이메일의 구글 계정으로 로그인해야 합니다.' });
		}
		return this.invitations.accept(invitation, actor.user_id);
	}
}
