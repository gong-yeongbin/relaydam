import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setToken } from '@/auth/token';
import { LoginPage } from './LoginPage';

const renderLogin = () =>
	render(
		<MemoryRouter initialEntries={['/login']}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/app" element={<p>대시보드</p>} />
			</Routes>
		</MemoryRouter>
	);

describe('LoginPage', () => {
	beforeEach(() => localStorage.clear());

	it('로고(랜딩 링크), 구글 버튼, 안내 한 줄을 보여준다', () => {
		renderLogin();
		expect(screen.getByRole('link', { name: 'relaydam' }).getAttribute('href')).toBe('/');
		expect(screen.getByRole('button', { name: /Google 계정으로 로그인/ })).toBeDefined();
		expect(screen.getByText('처음이면 계정이 자동으로 만들어집니다')).toBeDefined();
	});

	it('이미 로그인돼 있으면 /app으로 보낸다', () => {
		setToken('jwt');
		renderLogin();
		expect(screen.getByText('대시보드')).toBeDefined();
	});
});
