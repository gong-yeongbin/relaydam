import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { BigIntInterceptor, serializeBigInt } from './bigint.interceptor';

describe('serializeBigInt', () => {
	it('중첩된 객체·배열 안의 bigint를 문자열로 바꾼다', () => {
		expect(serializeBigInt({ id: 9007199254740993n, items: [{ event_id: 1n }], count: 2, name: 'a', none: null })).toEqual({
			id: '9007199254740993',
			items: [{ event_id: '1' }],
			count: 2,
			name: 'a',
			none: null,
		});
	});

	it('Date 같은 평범하지 않은 객체는 그대로 둔다', () => {
		const date = new Date('2026-09-27T00:00:00Z');
		expect(serializeBigInt({ created_at: date })).toEqual({ created_at: date });
	});
});

describe('BigIntInterceptor', () => {
	it('핸들러 응답을 직렬화한다', async () => {
		const next: CallHandler = { handle: () => of({ id: 1n }) };
		const result = new BigIntInterceptor().intercept({} as ExecutionContext, next);
		expect(await lastValueFrom(result)).toEqual({ id: '1' });
	});
});
