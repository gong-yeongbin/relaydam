import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@prisma/client';
import { IS_PUBLIC, ROLES, type RequestWithActor } from '@/common/auth/decorators';
import { exceedsMemberLimit } from '@/common/plan-limits';
import { satisfiesRole } from './domain/role';
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from './ports/membership.repository';
import { TOKEN_ISSUER, type TokenIssuer } from './ports/token.issuer';

type AuthRequest = RequestWithActor & { headers: { authorization?: string }; params: { orgId?: string; projectId?: string } };

const ORG_NOT_FOUND = { code: 'organization_not_found', message: '조직이 없습니다.' };
const PROJECT_NOT_FOUND = { code: 'project_not_found', message: '프로젝트가 없습니다.' };

const isId = (value: number) => Number.isSafeInteger(value) && value > 0;

// 전역 가드, deny-by-default. 모든 라우트는 @Public 또는 @Roles 중 하나가 있어야 한다.
@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly reflector: Reflector,
		@Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
		@Inject(MEMBERSHIP_REPOSITORY) private readonly memberships: MembershipRepository,
	) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const targets = [ctx.getHandler(), ctx.getClass()];
		if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

		const required = this.reflector.getAllAndOverride<MemberRole[] | undefined>(ROLES, targets);
		if (!required) throw new ForbiddenException({ code: 'forbidden', message: '접근 규칙이 지정되지 않은 라우트입니다.' });

		const request = ctx.switchToHttp().getRequest<AuthRequest>();
		const token = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
		const userId = token ? await this.tokens.verify(token) : null;
		if (userId === null) throw new UnauthorizedException({ code: 'unauthenticated', message: '인증이 필요합니다.' });

		if (required.length === 0) {
			request.actor = { kind: 'user', user_id: userId, org_id: null, role: null };
			return true;
		}

		// 숫자가 아닌 :orgId, 미소속 조직 모두 404. 존재 여부를 노출하지 않는다.
		const orgId = Number(request.params.orgId);
		if (!isId(orgId)) throw new NotFoundException(ORG_NOT_FOUND);
		const access = await this.memberships.findAccess(orgId, userId);
		if (!access) throw new NotFoundException(ORG_NOT_FOUND);
		const { role } = access;
		// 플랜 게이트 중 이것만 가드에 둔다. 조직의 모든 라우트에 걸려야 해서다. 근거는 context-notes.md "API 형식"
		if (role !== 'owner' && exceedsMemberLimit(access.plan, access.member_count)) {
			throw new ForbiddenException({ code: 'plan_limit', message: '멤버 수가 플랜 상한을 넘어 owner만 접근할 수 있습니다.' });
		}
		if (!satisfiesRole(role, required)) throw new ForbiddenException({ code: 'forbidden', message: '권한이 없습니다.' });

		// role은 조직 단위뿐이라 project는 "그 조직의 것인가"만 본다. 타 조직 project도 404
		if (request.params.projectId !== undefined) {
			const projectId = Number(request.params.projectId);
			if (!isId(projectId) || !(await this.memberships.projectInOrg(projectId, orgId))) throw new NotFoundException(PROJECT_NOT_FOUND);
		}

		request.actor = { kind: 'user', user_id: userId, org_id: orgId, role };
		return true;
	}
}
