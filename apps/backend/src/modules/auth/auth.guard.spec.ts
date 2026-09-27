import { type ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@prisma/client';
import { type Actor, Public, Roles } from '@/common/auth/decorators';
import { AuthGuard } from './auth.guard';
import type { MembershipRepository } from './ports/membership.repository';
import type { TokenIssuer } from './ports/token.issuer';

class Routes {
	@Public()
	open() {}
	bare() {}
	@Roles()
	loggedIn() {}
	@Roles('admin')
	adminOnly() {}
}

type Request = { headers: { authorization?: string }; params: { orgId?: string }; actor?: Actor };

function contextFor(handler: keyof Routes, request: Request): ExecutionContext {
	return {
		getHandler: () => Object.getOwnPropertyDescriptor(Routes.prototype, handler)!.value as () => void,
		getClass: () => Routes,
		switchToHttp: () => ({ getRequest: () => request }),
	} as unknown as ExecutionContext;
}

// 토큰 'valid-<userId>'만 유효하다. membership은 (org, user) → role
const tokens: TokenIssuer = {
	issue: (userId) => Promise.resolve(`valid-${userId}`),
	verify: (token) => Promise.resolve(token.startsWith('valid-') ? Number(token.slice(6)) : null),
};
const roles = new Map<string, MemberRole>([
	['1:10', 'owner'],
	['1:11', 'member'],
]);
const memberships: MembershipRepository = { findRole: (orgId, userId) => Promise.resolve(roles.get(`${orgId}:${userId}`) ?? null) };

const guard = new AuthGuard(new Reflector(), tokens, memberships);

function request(token: string | null, orgId?: string): Request {
	return { headers: token ? { authorization: `Bearer ${token}` } : {}, params: { orgId } };
}

describe('AuthGuard', () => {
	it('@Public은 토큰 없이 통과한다', async () => {
		expect(await guard.canActivate(contextFor('open', request(null)))).toBe(true);
	});

	it('@Public·@Roles가 모두 없으면 403 (deny-by-default)', async () => {
		await expect(guard.canActivate(contextFor('bare', request('valid-10')))).rejects.toThrow(ForbiddenException);
	});

	it('토큰이 없거나 형식이 틀리거나 유효하지 않으면 401', async () => {
		await expect(guard.canActivate(contextFor('loggedIn', request(null)))).rejects.toThrow(UnauthorizedException);
		await expect(guard.canActivate(contextFor('loggedIn', request('invalid')))).rejects.toThrow(UnauthorizedException);
		const basic = { headers: { authorization: 'Basic abc' }, params: {} };
		await expect(guard.canActivate(contextFor('loggedIn', basic))).rejects.toThrow(UnauthorizedException);
	});

	it('@Roles() 빈 인자는 로그인만 보고 조직 없는 주체를 붙인다', async () => {
		const req = request('valid-10');
		expect(await guard.canActivate(contextFor('loggedIn', req))).toBe(true);
		expect(req.actor).toEqual({ kind: 'user', user_id: 10, org_id: null, role: null });
	});

	it('role이 충분하면 조직 주체를 붙인다', async () => {
		const req = request('valid-10', '1');
		expect(await guard.canActivate(contextFor('adminOnly', req))).toBe(true);
		expect(req.actor).toEqual({ kind: 'user', user_id: 10, org_id: 1, role: 'owner' });
	});

	it('소속이지만 role이 부족하면 403', async () => {
		await expect(guard.canActivate(contextFor('adminOnly', request('valid-11', '1')))).rejects.toThrow(ForbiddenException);
	});

	it('미소속 조직, 숫자가 아닌 orgId, orgId 없음은 404', async () => {
		await expect(guard.canActivate(contextFor('adminOnly', request('valid-10', '2')))).rejects.toThrow(NotFoundException);
		await expect(guard.canActivate(contextFor('adminOnly', request('valid-10', 'abc')))).rejects.toThrow(NotFoundException);
		await expect(guard.canActivate(contextFor('adminOnly', request('valid-10')))).rejects.toThrow(NotFoundException);
	});
});
