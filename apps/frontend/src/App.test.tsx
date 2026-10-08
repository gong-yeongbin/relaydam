import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';

describe('App', () => {
	it('/ 는 랜딩이다', () => {
		localStorage.clear();
		render(
			<MemoryRouter initialEntries={['/']}>
				<App />
			</MemoryRouter>
		);
		expect(screen.getByRole('heading', { level: 1, name: '웹훅, 한 건도 잃지 않고 전달합니다' })).toBeDefined();
	});

	it('/login 은 로그인이다', () => {
		localStorage.clear();
		render(
			<MemoryRouter initialEntries={['/login']}>
				<App />
			</MemoryRouter>
		);
		expect(screen.getByRole('button', { name: /Google 계정으로 로그인/ })).toBeDefined();
	});
});
