import { GoogleOutlined } from '@ant-design/icons';
import { Button, Card, Layout, Typography } from 'antd';
import { Link, Navigate } from 'react-router';
import { getToken } from '@/auth/token';
import { colors } from '@/theme';

const { Text } = Typography;

// 가입과 로그인이 같은 버튼이다. 구글 연동은 아직 붙이지 않았다
export function LoginPage() {
	if (getToken()) return <Navigate to="/app" replace />;

	return (
		<Layout style={{ minHeight: '100vh', background: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
			<Card style={{ width: 400, textAlign: 'center' }} styles={{ body: { padding: '40px 32px' } }}>
				<Link to="/" style={{ color: colors.ink, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>
					relaydam
				</Link>
				<Button type="primary" size="large" icon={<GoogleOutlined />} block style={{ marginTop: 32 }}>
					Google 계정으로 로그인
				</Button>
				<Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 13 }}>
					처음이면 계정이 자동으로 만들어집니다
				</Text>
			</Card>
		</Layout>
	);
}
