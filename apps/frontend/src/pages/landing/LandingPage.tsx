import { Button, Layout, Typography } from 'antd';
import { Link, Navigate } from 'react-router';
import { getToken } from '@/auth/token';
import { colors } from '@/theme';
import { FlowDiagram } from './FlowDiagram';

const { Title, Paragraph, Text } = Typography;

// 실제로 만든 것만 적는다
const FEATURES = [
	{ title: '저장 먼저', body: '받는 즉시 저장, 중복은 한 번만' },
	{ title: '자동 재시도', body: '5분·10분·20분… 대시보드에서 재전송' },
	{ title: '서명 검증', body: '업체 서명을 확인하고 우리 서명을 붙여 전달' },
];

const SIDE = '0 48px';

// 로그인 전 누구나 보는 한 장. 가운데 정렬, 강조는 흐름 그림의 relaydam 하나
export function LandingPage() {
	// 이미 로그인돼 있으면 대시보드로
	if (getToken()) return <Navigate to="/app" replace />;

	return (
		<Layout style={{ minHeight: '100vh', background: colors.bg }}>
			<Layout.Header style={{ background: 'transparent', height: 64, lineHeight: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: SIDE }}>
				<Text strong style={{ fontSize: 20, letterSpacing: '-0.01em', color: colors.ink }}>
					relaydam
				</Text>
				<Link to="/login">
					<Button type="primary">로그인</Button>
				</Link>
			</Layout.Header>

			<Layout.Content style={{ maxWidth: 1040, width: '100%', margin: '0 auto', padding: `88px 48px 96px`, textAlign: 'center' }}>
				<Title level={1} style={{ fontSize: 44, lineHeight: 1.2, letterSpacing: '-0.02em', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', color: colors.ink }}>
					웹훅, 한 건도 잃지 않고 전달합니다
				</Title>
				<Paragraph style={{ fontSize: 18, lineHeight: 1.65, color: colors.muted, margin: '20px auto 0', whiteSpace: 'nowrap' }}>결제·배포 웹훅을 먼저 저장하고, 고객 서버가 받을 때까지 대신 재시도합니다.</Paragraph>

				<div style={{ marginTop: 72, maxWidth: 780, margin: '72px auto 0' }}>
					<FlowDiagram />
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 40, marginTop: 72, paddingTop: 40, borderTop: `1px solid ${colors.line}`, textAlign: 'left' }}>
					{FEATURES.map((feature) => (
						<div key={feature.title}>
							<Title level={5} style={{ margin: 0, fontSize: 16, color: colors.ink }}>
								{feature.title}
							</Title>
							<Text style={{ display: 'block', marginTop: 6, fontSize: 15, lineHeight: 1.6, color: colors.muted }}>{feature.body}</Text>
						</div>
					))}
				</div>
			</Layout.Content>

			<Layout.Footer style={{ background: 'transparent', display: 'flex', justifyContent: 'space-between', padding: `24px 48px`, borderTop: `1px solid ${colors.line}`, fontSize: 14, color: colors.muted }}>
				<span>© 2026 relaydam</span>
				<a href="https://github.com/gong-yeongbin/hookbuffer" target="_blank" rel="noreferrer" style={{ color: colors.muted }}>
					GitHub
				</a>
			</Layout.Footer>
		</Layout>
	);
}
