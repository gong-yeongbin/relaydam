import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { setToken } from '@/auth/token';
import { App } from '@/App';

const renderAt = (path: string) =>
	render(
		<MemoryRouter initialEntries={[path]}>
			<App />
		</MemoryRouter>
	);

describe('AppShell', () => {
	beforeEach(() => localStorage.clear());

	it('토큰이 없으면 /login으로 보낸다', () => {
		renderAt('/app/events');
		expect(screen.getByRole('button', { name: /Google 계정으로 로그인/ })).toBeDefined();
	});

	it('/app은 이벤트로 가고, 메뉴 7개와 준비 중 자리를 보여준다', () => {
		setToken('jwt');
		renderAt('/app');
		expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['이벤트', '전달', '거부된 요청', '연결', '소스', '목적지', '설정']);
		expect(screen.getByRole('link', { name: '이벤트' }).getAttribute('href')).toBe('/app/events');
		expect(screen.getByText('준비 중')).toBeDefined();
		expect(screen.getByRole('combobox', { name: '프로젝트' })).toBeDefined();
		expect(screen.getByText('기본 프로젝트')).toBeDefined();
	});

	it('프로젝트 선택에서 새 프로젝트를 고르면 만들기 창이 뜬다', async () => {
		setToken('jwt');
		renderAt('/app/events');
		fireEvent.mouseDown(screen.getByRole('combobox', { name: '프로젝트' }));
		const option = (await screen.findByText('새 프로젝트')).closest('.ant-select-item-option');
		fireEvent.click(option!);
		expect(await screen.findByRole('button', { name: '만들기' })).toBeDefined();
		expect(screen.getByRole('textbox')).toBeDefined();
	});

	it('로그아웃하면 토큰을 지우고 /login으로 간다', async () => {
		setToken('jwt');
		renderAt('/app/events');
		fireEvent.click(screen.getByRole('button', { name: '내 계정' }));
		fireEvent.click(await screen.findByText('로그아웃'));
		expect(localStorage.getItem('relaydam.token')).toBeNull();
		expect(await screen.findByRole('button', { name: /Google 계정으로 로그인/ })).toBeDefined();
	});
});
