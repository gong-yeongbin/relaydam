import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';

// 가드가 인증을 끝내고 요청에 붙이는 주체. 조직과 무관한 라우트(@Roles() 빈 인자)면 org_id·role이 null이다.
// api_key 주체는 5. api_key 모듈에서 추가한다.
export type Actor = { kind: 'user'; user_id: number; org_id: number | null; role: MemberRole | null };

export type RequestWithActor = { actor?: Actor };

// 인증 없이 호출할 수 있는 라우트
export const Public = () => SetMetadata(IS_PUBLIC, true);

// 로그인이 필요한 라우트. 인자가 있으면 :orgId의 membership role이 그 이상이어야 한다(owner ⊃ admin ⊃ member).
// 인자가 없으면 로그인만 본다(/users/me처럼 조직과 무관한 라우트).
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES, roles);

export function actorFromContext(ctx: ExecutionContext): Actor {
	const actor = ctx.switchToHttp().getRequest<RequestWithActor>().actor;
	// @Public 라우트에서 @Actor()를 쓰면 여기 온다. 런타임 데이터가 아니라 코드 실수다.
	if (!actor) throw new Error('@Actor()는 @Roles 라우트에서만 쓸 수 있다');
	return actor;
}

// 타입 Actor와 같은 이름이다. 핸들러에서 `@Actor() actor: Actor`로 쓴다.
export const Actor = createParamDecorator((_: unknown, ctx: ExecutionContext) => actorFromContext(ctx));
