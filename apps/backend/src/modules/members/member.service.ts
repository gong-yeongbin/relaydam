import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { organization_member } from '@prisma/client';
import type { Actor } from '@/common/auth/decorators';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { MEMBER_REPOSITORY, type MemberRepository, type MemberWithUser } from './ports/member.repository';

@Injectable()
export class MemberService {
	constructor(@Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository) {}

	async list(orgId: number, query: ListQueryDto): Promise<Page<MemberWithUser>> {
		return toPage(await this.members.list(orgId, query.cursor ?? null, query.limit + 1), query.limit, (m) => m.user_id);
	}

	// owner는 조직당 1명이라 역할을 바꾸지 않는다. owner 양도는 MVP 제외
	async changeRole(orgId: number, userId: number, role: 'admin' | 'member'): Promise<MemberWithUser> {
		const target = await this.findOrThrow(orgId, userId);
		if (target.role === 'owner') throw new ForbiddenException({ code: 'forbidden', message: 'owner의 역할은 바꿀 수 없습니다.' });
		return this.members.updateRole(orgId, userId, role);
	}

	// 본인은 누구나 나갈 수 있고, 다른 멤버는 admin 이상만 내보낸다. owner는 어느 쪽도 안 된다
	async remove(actor: Actor, orgId: number, userId: number): Promise<void> {
		const target = await this.findOrThrow(orgId, userId);
		if (target.role === 'owner') throw new ForbiddenException({ code: 'forbidden', message: 'owner는 조직에서 나가거나 내보낼 수 없습니다.' });
		if (userId !== actor.user_id && actor.role === 'member') throw new ForbiddenException({ code: 'forbidden', message: '권한이 없습니다.' });
		await this.members.remove(orgId, userId);
	}

	private async findOrThrow(orgId: number, userId: number): Promise<organization_member> {
		const found = await this.members.find(orgId, userId);
		if (!found) throw new NotFoundException({ code: 'member_not_found', message: '멤버가 없습니다.' });
		return found;
	}
}
