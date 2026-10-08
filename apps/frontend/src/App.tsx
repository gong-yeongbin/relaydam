import { Route, Routes } from 'react-router';
import { LandingPage } from './pages/landing/LandingPage';
import { LoginPage } from './pages/login/LoginPage';

// 라우트 표. 화면이 늘 때마다 한 줄씩
export function App() {
	return (
		<Routes>
			<Route path="/" element={<LandingPage />} />
			<Route path="/login" element={<LoginPage />} />
		</Routes>
	);
}
