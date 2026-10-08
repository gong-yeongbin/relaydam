import type { ThemeConfig } from 'antd';

// 랜딩과 대시보드가 같이 쓰는 색·글꼴. 청록 하나만 강조색으로 쓴다
export const colors = {
	bg: '#F5F7F6',
	ink: '#16211F',
	muted: '#5B6663',
	line: '#DDE3E1',
	accent: '#0B6E66',
	success: '#1F7A4D',
	danger: '#B4452B',
};

export const theme: ThemeConfig = {
	token: {
		fontFamily: "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif",
		colorPrimary: colors.accent,
		colorSuccess: colors.success,
		colorError: colors.danger,
		colorText: colors.ink,
		colorTextSecondary: colors.muted,
		colorBorder: colors.line,
		colorBgLayout: colors.bg,
		borderRadius: 6,
	},
};
