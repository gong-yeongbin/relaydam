import { clearToken, getToken, setToken } from './token';

describe('token', () => {
	it('저장·조회·삭제', () => {
		localStorage.clear();
		expect(getToken()).toBeNull();
		setToken('jwt');
		expect(getToken()).toBe('jwt');
		clearToken();
		expect(getToken()).toBeNull();
	});
});
