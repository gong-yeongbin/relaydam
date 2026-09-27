import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Actor, actorFromContext, IS_PUBLIC, Public, ROLES, Roles } from './decorators';

// 데코레이터 메타데이터는 메서드 함수 자체에 붙는다. this 바인딩 경고 없이 함수를 꺼낸다
function method(target: object, name: string): () => void {
	return Object.getOwnPropertyDescriptor(target, name)!.value as () => void;
}

function contextWith(request: object): ExecutionContext {
	return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}

describe('auth 데코레이터', () => {
	const reflector = new Reflector();

	it('@Public은 IS_PUBLIC 메타데이터를 단다', () => {
		class Target {
			@Public()
			handler() {}
		}
		expect(reflector.get(IS_PUBLIC, method(Target.prototype, 'handler'))).toBe(true);
	});

	it('@Roles는 인자를 그대로, 빈 인자는 빈 배열로 단다', () => {
		class Target {
			@Roles('admin')
			admin() {}
			@Roles()
			loggedIn() {}
		}
		expect(reflector.get(ROLES, method(Target.prototype, 'admin'))).toEqual(['admin']);
		expect(reflector.get(ROLES, method(Target.prototype, 'loggedIn'))).toEqual([]);
	});

	it('actorFromContext는 가드가 붙인 주체를 돌려준다', () => {
		const actor: Actor = { kind: 'user', user_id: 1, org_id: 2, role: 'owner' };
		expect(actorFromContext(contextWith({ actor }))).toBe(actor);
	});

	it('주체가 없으면 코드 실수로 보고 던진다', () => {
		expect(() => actorFromContext(contextWith({}))).toThrow('@Actor()');
	});
});
