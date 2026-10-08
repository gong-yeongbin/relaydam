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
	components: {
		// 사이드바 메뉴. 선택은 배경 없이 진한 글자 + 왼쪽 청록 세로선(AppShell의 CSS)
		Menu: {
			itemHeight: 36,
			itemMarginInline: 0,
			itemMarginBlock: 2,
			itemBorderRadius: 0,
			itemPaddingInline: 24,
			fontSize: 14,
			itemColor: colors.muted,
			itemHoverColor: colors.ink,
			itemHoverBg: 'transparent',
			itemSelectedColor: colors.ink,
			itemSelectedBg: 'transparent',
			itemActiveBg: 'transparent',
		},
	},
};
