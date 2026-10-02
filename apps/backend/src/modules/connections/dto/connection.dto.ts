import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RetryStrategy } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ListQueryDto } from '@/common/http/pagination';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

// Prisma enum RetryStrategy와 같은 값. 여기서 @prisma/client를 런타임으로 import할 수 없어 따로 둔다
export const RETRY_STRATEGIES = ['linear', 'exponential'] as const satisfies readonly RetryStrategy[];

// 자동 재시도는 최대 50회다(Hookdeck과 같다). 1주일 상한은 전달 워커가 본다
export const MAX_RETRY_COUNT = 50;
const MIN_RETRY_INTERVAL_MS = 1_000;
const MAX_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1_000;

// 재시도 설정. 생성과 수정이 같이 쓴다. 보내지 않으면 기본값(2배씩·5분·9회) 또는 지금 값 그대로다
export class RetryRuleDto {
	@ApiPropertyOptional({ description: '재시도 간격을 늘리는 방식. linear는 매번 같은 간격, exponential은 2배씩', enum: RETRY_STRATEGIES, default: 'exponential' })
	@IsOptional()
	@IsIn(RETRY_STRATEGIES)
	retry_strategy?: RetryStrategy;

	@ApiPropertyOptional({ description: '첫 재시도까지의 간격(ms). 1초~24시간', default: 300_000, minimum: MIN_RETRY_INTERVAL_MS, maximum: MAX_RETRY_INTERVAL_MS })
	@IsOptional()
	@IsInt()
	@Min(MIN_RETRY_INTERVAL_MS)
	@Max(MAX_RETRY_INTERVAL_MS)
	retry_interval_ms?: number;

	@ApiPropertyOptional({ description: '자동 재시도 횟수(첫 시도 제외). 0이면 재시도하지 않는다. 다 쓰면 dead', default: 9, minimum: 0, maximum: MAX_RETRY_COUNT })
	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(MAX_RETRY_COUNT)
	retry_count?: number;
}

export class CreateConnectionDto extends RetryRuleDto {
	@ApiProperty({ description: '이 프로젝트의 소스 id', example: 7 })
	@IsInt()
	@Min(1)
	source_id: number;

	@ApiProperty({ description: '이 프로젝트의 목적지 id', example: 3 })
	@IsInt()
	@Min(1)
	destination_id: number;
}

export class UpdateConnectionDto extends RetryRuleDto {}

export class ListConnectionsQueryDto extends ListQueryDto {
	@ApiPropertyOptional({ description: '이 소스의 연결만', example: 7 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	source_id?: number;

	@ApiPropertyOptional({ description: '이 목적지의 연결만', example: 3 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	destination_id?: number;
}

export class ConnectionParamDto extends ProjectParamDto {
	@ApiProperty({ example: 12 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	connectionId: number;
}

export class ConnectionDto {
	@ApiProperty({ example: 12 })
	id: number;

	@ApiProperty({ example: 7 })
	source_id: number;

	@ApiProperty({ example: 3 })
	destination_id: number;

	@ApiProperty({ enum: RETRY_STRATEGIES, example: 'exponential' })
	retry_strategy: RetryStrategy;

	@ApiProperty({ description: '첫 재시도까지의 간격(ms)', example: 300_000 })
	retry_interval_ms: number;

	@ApiProperty({ description: '자동 재시도 횟수(첫 시도 제외)', example: 9 })
	retry_count: number;

	@ApiProperty({ type: Date, nullable: true, description: '일시 정지한 시각. 정지 중에는 웹훅을 받아 저장하고 전달만 보류한다', example: null })
	paused_at: Date | null;

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-10-02T00:00:00.000Z' })
	updated_at: Date;
}

export class ConnectionPageDto {
	@ApiProperty({ type: [ConnectionDto] })
	data: ConnectionDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '12' })
	next_cursor: string | null;
}
