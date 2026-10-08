import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Form, Input, Layout, Menu, Modal, Select, Typography } from 'antd';
import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { clearToken } from '@/auth/token';
import { colors } from '@/theme';

const { Text } = Typography;

// 사이드바 메뉴. 경로가 곧 key다
const MENU: ({ key: string; label: string } | { type: 'divider' })[] = [
	{ key: '/app/events', label: '이벤트' },
	{ key: '/app/deliveries', label: '전달' },
	{ key: '/app/rejected-requests', label: '거부된 요청' },
	{ key: '/app/connections', label: '연결' },
	{ key: '/app/sources', label: '소스' },
	{ key: '/app/destinations', label: '목적지' },
	{ type: 'divider' },
	{ key: '/app/settings', label: '설정' },
];

// 대시보드 공통 틀. 왼쪽 사이드바 + 상단 바. 가운데에 화면이 들어온다
export function AppShell() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [creating, setCreating] = useState(false);

	const logout = () => {
		clearToken();
		void navigate('/login', { replace: true });
	};

	return (
		<Layout style={{ minHeight: '100vh' }}>
			<Layout.Sider width={220} style={{ background: '#fff', borderRight: `1px solid ${colors.line}` }}>
				<div style={{ padding: '20px 16px 12px' }}>
					<Link to="/app" style={{ color: colors.ink, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
						relaydam
					</Link>
				</div>
				{/* 프로젝트 전환. 목록·생성은 API를 붙일 때 채운다 */}
				<div style={{ padding: '0 16px 16px' }}>
					<Select
						aria-label="프로젝트"
						value="default"
						options={[
							{ value: 'default', label: '기본 프로젝트' },
							{
								value: 'new',
								label: (
									<span style={{ color: colors.accent }}>
										<PlusOutlined style={{ marginRight: 6 }} />새 프로젝트
									</span>
								),
							},
						]}
						onChange={(value) => value === 'new' && setCreating(true)}
						style={{ width: '100%' }}
					/>
				</div>
				{/* 만들기는 프로젝트 API를 붙일 때 연결한다 */}
				<Modal title="새 프로젝트" open={creating} onCancel={() => setCreating(false)} onOk={() => setCreating(false)} okText="만들기" cancelText="취소">
					<Form layout="vertical">
						<Form.Item label="이름" required>
							<Input placeholder="예: shop" />
						</Form.Item>
					</Form>
				</Modal>
				<Menu
					mode="inline"
					selectedKeys={[pathname]}
					items={MENU.map((item) =>
						'key' in item
							? {
									...item,
									label: (
										<Link to={item.key} style={{ fontWeight: pathname === item.key ? 600 : 500 }}>
											{item.label}
										</Link>
									),
								}
							: item
					)}
					style={{ borderInlineEnd: 0, background: 'transparent' }}
				/>
			</Layout.Sider>

			<Layout>
				<Layout.Header style={{ background: '#fff', height: 56, lineHeight: '56px', padding: '0 24px', borderBottom: `1px solid ${colors.line}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
					<Dropdown menu={{ items: [{ key: 'logout', label: '로그아웃', onClick: logout }] }} trigger={['click']}>
						<button type="button" aria-label="내 계정" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
							<Avatar size={32} icon={<UserOutlined />} />
						</button>
					</Dropdown>
				</Layout.Header>

				<Layout.Content style={{ padding: 32 }}>
					<Outlet />
				</Layout.Content>
			</Layout>
		</Layout>
	);
}

// 아직 안 만든 화면 자리
export function Placeholder() {
	return <Text type="secondary">준비 중</Text>;
}
