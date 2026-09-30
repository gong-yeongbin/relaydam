import type { InvitationRole, invitation, organization_member, Plan } from '@prisma/client';

// 응답·목록용. token_hash는 읽지 않는다
export type InvitationView = Omit<invitation, 'token_hash'>;

export type InviteContext = {
	org_name: string;
	plan: Plan;
	member_count: number;
	// now 기준 만료 전 초대 수. 같은 email의 기존 초대는 교체되므로 세지 않는다
	pending_count: number;
	already_member: boolean;
	inviter_name: string;
};

export interface InvitationRepository {
	inviteContext(orgId: number, email: string, inviterId: number, now: Date): Promise<InviteContext>;
	// (organization_id, email)이 같은 행이 있으면 role·토큰·만료·초대한 사람을 바꾼다
	upsert(data: { organization_id: number; email: string; role: InvitationRole; token_hash: string; expires_at: Date; invited_by_user_id: number }): Promise<InvitationView>;
	// id 내림차순. cursor가 있으면 그보다 작은 id부터 take개
	list(orgId: number, cursor: number | null, take: number): Promise<InvitationView[]>;
	// 지웠으면 true, 그 조직의 초대가 아니면 false
	remove(orgId: number, id: number): Promise<boolean>;
	findByTokenHash(tokenHash: string): Promise<invitation | null>;
	findUserEmail(userId: number): Promise<string | null>;
	// 멤버를 만들고 초대를 지운다(한 트랜잭션). 이미 멤버면 초대만 지우고 기존 행을 준다
	accept(invitation: invitation, userId: number): Promise<organization_member>;
}

export const INVITATION_REPOSITORY = Symbol('InvitationRepository');
// 수락 링크의 프론트 주소. 예: https://app.relaydam.dev
export const APP_URL = Symbol('AppUrl');
