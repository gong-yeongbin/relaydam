import { satisfiesRole } from './role';

describe('satisfiesRole', () => {
	it('owner ⊃ admin ⊃ member', () => {
		expect(satisfiesRole('owner', ['admin'])).toBe(true);
		expect(satisfiesRole('admin', ['admin'])).toBe(true);
		expect(satisfiesRole('member', ['admin'])).toBe(false);
		expect(satisfiesRole('admin', ['owner'])).toBe(false);
	});

	it('요구 role이 여럿이면 하나만 만족해도 된다', () => {
		expect(satisfiesRole('member', ['owner', 'member'])).toBe(true);
	});
});
