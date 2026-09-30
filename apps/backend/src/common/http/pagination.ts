import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 목록 쿼리 공통. 정렬은 id DESC 고정이라 cursor보다 작은 id부터 limit개. 근거는 context-notes.md "API 형식".
export class ListQueryDto {
	@ApiPropertyOptional({ description: '이전 응답의 next_cursor', example: '42' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	cursor?: number;

	@ApiPropertyOptional({ description: '페이지 크기', default: 50, minimum: 1, maximum: 200 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	limit: number = 50;
}

export type Page<T> = { data: T[]; next_cursor: string | null };

// 저장소는 limit + 1개를 읽어 넘긴다. 한 개가 더 있으면 다음 페이지가 있다는 뜻이다.
export function toPage<T extends { id: number | bigint }>(rows: T[], limit: number): Page<T> {
	const last = rows.length > limit ? rows[limit - 1] : undefined;
	if (!last) return { data: rows, next_cursor: null };
	return { data: rows.slice(0, limit), next_cursor: String(last.id) };
}
