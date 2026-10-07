import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AttemptTrigger, DeliveryStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { ListQueryDto } from '@/common/http/pagination';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

// Prisma enum과 같은 값. 여기서 @prisma/client를 런타임으로 import할 수 없어 따로 둔다
export const DELIVERY_STATUSES = ['pending', 'succeeded', 'failed', 'dead', 'canceled', 'held'] as const satisfies readonly DeliveryStatus[];
export const ATTEMPT_TRIGGERS = ['initial', 'automatic', 'manual', 'bulk_retry', 'unpause'] as const satisfies readonly AttemptTrigger[];
// 일괄 재시도로 되돌릴 수 있는 상태
export const BULK_RETRY_STATUSES = ['dead', 'failed', 'canceled'] as const satisfies readonly DeliveryStatus[];

// delivery id는 BigInt라 문자열로 받는다. 핸들러가 BigInt로 바꾼다
export class DeliveryParamDto extends ProjectParamDto {
	@ApiProperty({ type: String, example: '345' })
	@Matches(/^\d{1,19}$/)
	deliveryId: string;
}

export class ListDeliveriesQueryDto extends ListQueryDto {
	@ApiPropertyOptional({ description: '이 상태인 것만', enum: DELIVERY_STATUSES })
	@IsOptional()
	@IsIn(DELIVERY_STATUSES)
	status?: DeliveryStatus;

	@ApiPropertyOptional({ description: '이 목적지로 가는 것만', example: 3 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	destination_id?: number;

	@ApiPropertyOptional({ type: String, description: '이 이벤트의 것만', example: '120' })
	@IsOptional()
	@Matches(/^\d{1,19}$/)
	event_id?: string;
}

export class BulkRetryDto {
	@ApiProperty({ description: '이 상태인 것을 다시 보낸다', enum: BULK_RETRY_STATUSES, example: 'dead' })
	@IsIn(BULK_RETRY_STATUSES)
	status: (typeof BULK_RETRY_STATUSES)[number];

	@ApiPropertyOptional({ description: '이 목적지로 가는 것만', example: 3 })
	@IsOptional()
	@IsInt()
	@Min(1)
	destination_id?: number;

	@ApiPropertyOptional({ description: '이 시각 이후(포함)에 만들어진 것만', example: '2026-10-01T00:00:00Z' })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	created_after?: Date;

	@ApiPropertyOptional({ description: '이 시각 전에 만들어진 것만', example: '2026-10-02T00:00:00Z' })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	created_before?: Date;
}

export class BulkRetryResultDto {
	@ApiProperty({ description: '다시 보내기로 한 수. 한 번에 최대 1,000건. 더 있으면 다시 부른다', example: 10 })
	count: number;
}

export class DeliveryDto {
	@ApiProperty({ type: String, example: '345' })
	id: bigint;

	@ApiProperty({ type: String, example: '120' })
	event_id: bigint;

	@ApiProperty({ type: Number, nullable: true, description: '목적지. 그 뒤 지워졌으면 null', example: 3 })
	destination_id: number | null;

	@ApiProperty({ type: Number, nullable: true, description: '이 전달을 만든 연결. 그 뒤 지워졌으면 null', example: 12 })
	connection_id: number | null;

	@ApiProperty({ enum: DELIVERY_STATUSES, description: 'pending 큐 대기·처리 중, failed 재시도 대기, dead 재시도 소진, canceled 취소, held 일시 정지·프로젝트 정지로 보류' })
	status: DeliveryStatus;

	@ApiProperty({ description: '지금까지 한 시도 수', example: 2 })
	attempt: number;

	@ApiProperty({ type: Date, nullable: true, description: 'failed면 다음 재시도 시각', example: '2026-10-02T00:10:00.000Z' })
	next_attempt_at: Date | null;

	@ApiProperty({ type: Number, nullable: true, example: 503 })
	last_status_code: number | null;

	@ApiProperty({ type: String, nullable: true, description: '응답을 못 받았을 때의 오류(timeout, ECONNREFUSED, blocked_address 등)', example: null })
	last_error: string | null;

	@ApiProperty({ example: '2026-10-02T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-10-02T00:05:00.000Z' })
	updated_at: Date;
}

export class DeliveryAttemptDto {
	@ApiProperty({ type: String, example: '900' })
	id: bigint;

	@ApiProperty({ type: String, example: '345' })
	delivery_id: bigint;

	@ApiProperty({ example: 1 })
	attempt_no: number;

	@ApiProperty({ enum: ATTEMPT_TRIGGERS, description: '이 시도를 만든 것. initial 첫 시도, automatic 자동 재시도, manual 수동 재시도, bulk_retry 일괄 재시도, unpause 일시 정지 해제' })
	trigger: AttemptTrigger;

	@ApiProperty({ type: Number, nullable: true, example: 503 })
	status_code: number | null;

	@ApiProperty({ type: String, nullable: true, example: null })
	error: string | null;

	@ApiProperty({ example: 120 })
	duration_ms: number;

	@ApiProperty({ type: String, nullable: true, description: '응답 본문. 4KB까지', example: '{"ok":true}' })
	response_body: string | null;

	@ApiProperty({ example: '2026-10-02T00:00:00.000Z' })
	attempted_at: Date;
}

export class DeliveryDetailDto extends DeliveryDto {
	@ApiProperty({ type: [DeliveryAttemptDto], description: '시도 기록. 오래된 것부터' })
	attempts: DeliveryAttemptDto[];
}

export class DeliveryPageDto {
	@ApiProperty({ type: [DeliveryDto] })
	data: DeliveryDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '345' })
	next_cursor: string | null;
}
