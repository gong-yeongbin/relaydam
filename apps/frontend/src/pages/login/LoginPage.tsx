import { GoogleOutlined } from '@ant-design/icons';
import { Button, Card, Layout, Typography } from 'antd';
import { Link, Navigate, useNavigate } from 'react-router';
import { getToken, setToken } from '@/auth/token';
import { colors } from '@/theme';

const { Text } = Typography;

// 가입과 로그인이 같은 버튼이다. 구글 연동은 아직이라 누르면 임시 토큰을 넣고 대시보드로 간다
export function LoginPage() {
	const navigate = useNavigate();
	if (getToken()) return <Navigate to="/app" replace />;

	const login = () => {
		setToken('dev');
		void navigate('/app', { replace: true });
	};

	return (
		<Layout style={{ minHeight: '100vh', background: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
			<Card style={{ width: 400, textAlign: 'center' }} styles={{ body: { padding: '40px 32px' } }}>
				<Link to="/" style={{ color: colors.ink, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
					relaydam
				</Link>
				<Button type="primary" size="large" icon={<GoogleOutlined />} block style={{ marginTop: 32 }} onClick={login}>
					Google 계정으로 로그인
				</Button>
				<Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
					처음이면 계정이 자동으로 만들어집니다
				</Text>
			</Card>
		</Layout>
	);
}
