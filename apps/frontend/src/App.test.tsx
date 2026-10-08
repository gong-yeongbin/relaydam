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
});
