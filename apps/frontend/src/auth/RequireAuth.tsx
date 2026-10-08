import { Navigate, Outlet } from 'react-router';
import { getToken } from './token';

// 로그인 뒤 화면을 감싼다. 토큰이 없으면 로그인으로
export function RequireAuth() {
	return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}
