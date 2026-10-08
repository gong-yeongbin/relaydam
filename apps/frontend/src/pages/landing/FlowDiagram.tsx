import { colors } from '@/theme';

// 발신자 → relaydam → 고객 서버. 실패하면 relaydam이 다시 보낸다. relaydam만 강조색
const NODES = [
	{ x: 0, label: '발신자', accent: false },
	{ x: 300, label: 'relaydam', accent: true },
	{ x: 600, label: '고객 서버', accent: false },
];
const W = 180;
const H = 60;

export function FlowDiagram() {
	return (
		<svg viewBox="0 0 780 140" role="img" aria-label="발신자가 보낸 웹훅을 relaydam이 받아 고객 서버로 전달하고, 실패하면 다시 보낸다" style={{ width: '100%', maxWidth: 780, display: 'block' }}>
			<defs>
				<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill={colors.muted} />
				</marker>
				<marker id="arrow-accent" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
					<path d="M 0 0 L 10 5 L 0 10 z" fill={colors.accent} />
				</marker>
			</defs>
			{NODES.map((node) => (
				<g key={node.label}>
					<rect x={node.x} y={20} width={W} height={H} rx={6} fill={node.accent ? colors.accent : '#fff'} stroke={node.accent ? colors.accent : colors.line} strokeWidth={1.5} />
					<text x={node.x + W / 2} y={56} textAnchor="middle" fontSize={16} fontWeight={node.accent ? 700 : 500} fill={node.accent ? '#fff' : colors.ink}>
						{node.label}
					</text>
				</g>
			))}
			<line x1={180} y1={50} x2={298} y2={50} stroke={colors.muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
			<line x1={480} y1={50} x2={598} y2={50} stroke={colors.muted} strokeWidth={1.5} markerEnd="url(#arrow)" />
			<path d="M 690 82 C 690 122, 390 122, 390 84" fill="none" stroke={colors.accent} strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#arrow-accent)" />
			<text x={540} y={135} textAnchor="middle" fontSize={13} fill={colors.accent}>
				실패하면 재시도
			</text>
		</svg>
	);
}
