import { type ArgumentsHost, ConflictException, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter, toErrorBody } from './http-exception.filter';

describe('toErrorBody', () => {
	it('예외에 넘긴 { code, message }를 그대로 쓴다', () => {
		const body = { code: 'source_not_found', message: '소스가 없습니다.' };
		expect(toErrorBody(new NotFoundException(body))).toEqual({ status: 404, body });
	});

	it('객체 없이 던진 예외는 상태 코드별 기본 code로 바꾼다', () => {
		expect(toErrorBody(new ForbiddenException())).toEqual({ status: 403, body: { code: 'forbidden', message: '권한이 없습니다.' } });
		expect(toErrorBody(new ConflictException('중복')).body.code).toBe('conflict');
	});

	it('기본 code가 없는 상태 코드는 internal_error', () => {
		expect(toErrorBody(new HttpException('teapot', 418))).toEqual({ status: 418, body: { code: 'internal_error', message: '서버 오류가 발생했습니다.' } });
	});

	it('HttpException이 아니면 500 internal_error', () => {
		expect(toErrorBody(new Error('boom'))).toEqual({ status: 500, body: { code: 'internal_error', message: '서버 오류가 발생했습니다.' } });
	});
});

describe('HttpExceptionFilter', () => {
	afterEach(() => vi.restoreAllMocks());

	function hostWith(send: (body: unknown) => void, status: (code: number) => void): ArgumentsHost {
		const reply = {
			status: (code: number) => {
				status(code);
				return { send };
			},
		};
		return { switchToHttp: () => ({ getResponse: () => reply }) } as unknown as ArgumentsHost;
	}

	it('상태 코드와 본문을 응답에 쓰고 4xx는 로그를 남기지 않는다', () => {
		const send = vi.fn();
		const status = vi.fn();
		const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

		new HttpExceptionFilter().catch(new NotFoundException(), hostWith(send, status));

		expect(status).toHaveBeenCalledWith(404);
		expect(send).toHaveBeenCalledWith({ code: 'not_found', message: '찾을 수 없습니다.' });
		expect(log).not.toHaveBeenCalled();
	});

	it('5xx는 원인을 로그로 남긴다', () => {
		const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
		const error = new Error('boom');

		new HttpExceptionFilter().catch(error, hostWith(vi.fn(), vi.fn()));

		expect(log).toHaveBeenCalledWith(error);
	});
});
