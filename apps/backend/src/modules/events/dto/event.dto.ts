import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { ListQueryDto } from '@/common/http/pagination';
import { DeliveryDto } from '@/modules/deliveries/dto/delivery.dto';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

// event id는 BigInt라 문자열로 받는다. 핸들러가 BigInt로 바꾼다
export class EventParamDto extends ProjectParamDto {
	@ApiProperty({ type: String, example: '120' })
	@Matches(/^\d{1,19}$/)
	eventId: string;
}

export class ListEventsQueryDto extends ListQueryDto {
	@ApiPropertyOptional({ description: '이 소스로 온 것만', example: 7 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	source_id?: number;

	@ApiPropertyOptional({ description: '이 시각 이후(포함)에 받은 것만', example: '2026-10-01T00:00:00Z' })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	received_after?: Date;

	@ApiPropertyOptional({ description: '이 시각 전에 받은 것만', example: '2026-10-02T00:00:00Z' })
	@IsOptional()
	@Type(() => Date)
	@IsDate()
	received_before?: Date;
}

export class EventDto {
	@ApiProperty({ type: String, example: '120' })
	id: bigint;

	@ApiProperty({ example: 10 })
	project_id: number;

	@ApiProperty({ type: Number, nullable: true, description: '받은 소스. 그 뒤 소스가 지워졌으면 null', example: 7 })
	source_id: number | null;

	@ApiProperty({ description: '같은 웹훅을 가려내는 키. 업체 이벤트 id 또는 본문 해시. 리플레이로 만든 것은 replay:<원본 id>:<시각>', example: 'id:72d3162e-cc78-11e3-81ab-4c9367dc0958' })
	idempotency_key: string;

	@ApiProperty({ example: 'POST' })
	method: string;

	@ApiProperty({ description: '`/in/:slug` 뒤에 붙은 경로. 없으면 빈 문자열', example: '/orders' })
	path: string;

	@ApiProperty({ description: '쿼리 문자열(`?` 제외). 없으면 빈 문자열', example: 'v=2' })
	query: string;

	@ApiProperty({ type: String, nullable: true, example: '203.0.113.7' })
	source_ip: string | null;

	@ApiProperty({ description: '받을 때 서명을 확인했는가' })
	verified: boolean;

	@ApiProperty({ type: Object, description: '받은 요청 헤더', example: { 'content-type': 'application/json' } })
	headers: Prisma.JsonValue;

	@ApiProperty({ type: String, nullable: true, example: 'application/json' })
	content_type: string | null;

	@ApiProperty({ description: '본문 크기(바이트). 본문은 GET .../events/:id/body', example: 1204 })
	size: number;

	@ApiProperty({ example: '2026-10-02T00:00:00.000Z' })
	received_at: Date;
}

export class EventDetailDto extends EventDto {
	@ApiProperty({ type: [DeliveryDto], description: '이 이벤트의 전달. 연결마다 하나' })
	deliveries: DeliveryDto[];
}

export class EventPageDto {
	@ApiProperty({ type: [EventDto] })
	data: EventDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '120' })
	next_cursor: string | null;
}
