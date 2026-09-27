import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

// JSON은 2^53 이상을 표현하지 못하고 JSON.stringify는 bigint에서 던진다. 응답의 bigint를 문자열로 바꾼다.
// Prisma 행은 평범한 객체이므로 배열·평범한 객체만 따라 내려간다. Date 등 다른 객체는 그대로 둔다.
export function serializeBigInt(value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value)) return value.map(serializeBigInt);
	if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, serializeBigInt(inner)]));
	}
	return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
	intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
		return next.handle().pipe(map(serializeBigInt));
	}
}
