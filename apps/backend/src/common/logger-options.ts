import type { Params } from 'nestjs-pino';

// API 서버와 워커가 같은 로그 설정을 쓴다.
// 웹훅 게이트웨이의 제품 가치가 "무슨 일이 있었는지 볼 수 있다"이므로 로그는 처음부터 구조화한다.
// 평문 로그는 CloudWatch Logs Insights에서 목적지별 실패율 같은 집계가 불가능하다.
export function loggerOptions(): Params {
	return {
		pinoHttp: {
			level: process.env.LOG_LEVEL ?? 'info',
			// prod는 CloudWatch가 파싱할 JSON 그대로, 로컬만 사람이 읽을 형태로 바꾼다.
			transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
			redact: {
				paths: ['req.headers.authorization', 'req.headers.cookie'],
				censor: '[redacted]',
			},
		},
	};
}
