import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { setToken } from '@/auth/token';
import { LandingPage } from './LandingPage';

// /app은 아직 없어 자리만 둔다
const renderLanding = () =>
	render(
		<MemoryRouter initialEntries={['/']}>
			<Routes>
				<Route path="/" element={<LandingPage />} />
				<Route path="/app" element={<p>대시보드</p>} />
			</Routes>
		</MemoryRouter>
	);

describe('LandingPage', () => {
	beforeEach(() => localStorage.clear());

	it('제목, 흐름 그림, 특징 3개, GitHub 링크를 보여준다', () => {
		renderLanding();
		expect(screen.getByRole('heading', { level: 1, name: '웹훅, 한 건도 잃지 않고 전달합니다' })).toBeDefined();
		expect(screen.getByRole('img', { name: /실패하면 다시 보낸다/ })).toBeDefined();
		expect(screen.getAllByRole('heading', { level: 5 }).map((h) => h.textContent)).toEqual(['저장 먼저', '자동 재시도', '서명 검증']);
		expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toContain('github.com');
	});

	it('로그인·시작하기는 둘 다 /login으로 간다', () => {
		renderLanding();
		expect(screen.getByRole('link', { name: '로그인' }).getAttribute('href')).toBe('/login');
		expect(screen.getByRole('link', { name: '시작하기' }).getAttribute('href')).toBe('/login');
	});

	it('이미 로그인돼 있으면 /app으로 보낸다', () => {
		setToken('jwt');
		renderLanding();
		expect(screen.getByText('대시보드')).toBeDefined();
		expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
	});
});
