import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma, RejectionReason } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { ListQueryDto } from '@/common/http/pagination';

// Prisma enum RejectionReason과 같은 값. 여기서 @prisma/client를 런타임으로 import할 수 없어 따로 둔다
export const REJECTION_REASONS = [
	'payload_too_large',
	'project_suspended',
	'no_connection',
	'signature_missing',
	'signature_mismatch',
	'timestamp_out_of_range',
	'usage_exceeded',
] as const satisfies readonly RejectionReason[];

export class ListRejectedRequestsQueryDto extends ListQueryDto {
	@ApiPropertyOptional({ description: '이 소스로 온 것만', example: 7 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	source_id?: number;

	@ApiPropertyOptional({ description: '이 사유로 거부된 것만', enum: REJECTION_REASONS })
	@IsOptional()
	@IsIn(REJECTION_REASONS)
	reason?: RejectionReason;
}

export class RejectedRequestDto {
	@ApiProperty({ type: String, example: '512' })
	id: bigint;

	@ApiProperty({ example: 10 })
	project_id: number;

	@ApiProperty({ type: Number, nullable: true, description: '받은 소스. 그 뒤 소스가 지워졌으면 null', example: 7 })
	source_id: number | null;

	@ApiProperty({
		enum: REJECTION_REASONS,
		description: '거부한 이유. 서명 관련 세부(signature_missing·signature_mismatch·timestamp_out_of_range)는 발신자에게 주지 않고 여기에만 남긴다',
	})
	reason: RejectionReason;

	@ApiProperty({ type: Object, description: '받은 요청 헤더. 본문은 저장하지 않는다', example: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=…' } })
	headers: Prisma.JsonValue;

	@ApiProperty({ description: '본문 크기(바이트)', example: 1204 })
	size: number;

	@ApiProperty({ example: '2026-10-02T00:00:00.000Z' })
	received_at: Date;
}

export class RejectedRequestPageDto {
	@ApiProperty({ type: [RejectedRequestDto] })
	data: RejectedRequestDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '512' })
	next_cursor: string | null;
}
