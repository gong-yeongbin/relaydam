import { Navigate, Route, Routes, useLocation } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell, Placeholder } from './layout/AppShell';
import { LandingPage } from './pages/landing/LandingPage';
import { LoginPage } from './pages/login/LoginPage';

// 라우트 표. 화면이 늘 때마다 한 줄씩. 경로가 바뀌면 key가 바뀌어 .page의 페이드인이 다시 돈다
export function App() {
	const { pathname } = useLocation();
	return (
		<div key={pathname} className="page">
			<Routes>
				<Route path="/" element={<LandingPage />} />
				<Route path="/login" element={<LoginPage />} />
				<Route element={<RequireAuth />}>
					<Route path="/app" element={<AppShell />}>
						<Route index element={<Navigate to="/app/events" replace />} />
						<Route path="*" element={<Placeholder />} />
					</Route>
				</Route>
			</Routes>
		</div>
	);
}
