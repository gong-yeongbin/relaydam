import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

// Fastify reply 중 필터가 쓰는 부분만. fastify는 직접 의존성이 아니라 타입을 import하지 않는다.
type Reply = { status(code: number): { send(body: unknown): unknown } };

export type ErrorBody = { code: string; message: string; details?: { field: string; message: string }[] };

// 객체 없이 던진 예외(`throw new NotFoundException()`)와 Nest가 스스로 던진 예외의 기본 code
const DEFAULT_ERRORS: Record<number, ErrorBody> = {
	400: { code: 'validation_failed', message: '요청이 올바르지 않습니다.' },
	401: { code: 'unauthenticated', message: '인증이 필요합니다.' },
	403: { code: 'forbidden', message: '권한이 없습니다.' },
	404: { code: 'not_found', message: '찾을 수 없습니다.' },
	409: { code: 'conflict', message: '이미 존재합니다.' },
	413: { code: 'payload_too_large', message: '요청 본문이 너무 큽니다.' },
	429: { code: 'rate_limited', message: '요청이 너무 많습니다.' },
};
const INTERNAL_ERROR: ErrorBody = { code: 'internal_error', message: '서버 오류가 발생했습니다.' };

function isErrorBody(value: unknown): value is ErrorBody {
	return typeof value === 'object' && value !== null && typeof (value as ErrorBody).code === 'string';
}

export function toErrorBody(exception: unknown): { status: number; body: ErrorBody } {
	if (!(exception instanceof HttpException)) return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: INTERNAL_ERROR };

	const status = exception.getStatus();
	const response = exception.getResponse();
	if (isErrorBody(response)) return { status, body: response };
	return { status, body: DEFAULT_ERRORS[status] ?? INTERNAL_ERROR };
}

// 모든 오류를 `{ code, message }`로 낸다. 형식 근거는 context-notes.md "API 형식" 절.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost): void {
		const { status, body } = toErrorBody(exception);
		// 예상한 4xx는 로그를 남기지 않는다. 5xx만 원인을 남긴다.
		if (status >= 500) this.logger.error(exception);
		void host.switchToHttp().getResponse<Reply>().status(status).send(body);
	}
}
