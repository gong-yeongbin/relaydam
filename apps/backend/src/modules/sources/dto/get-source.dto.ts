import { ApiProperty } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

export class SourceParamDto extends ProjectParamDto {
	@ApiProperty({ example: 7 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	sourceId: number;
}

export class SourceDto {
	@ApiProperty({ example: 7 })
	id: number;

	@ApiProperty({ example: 10 })
	project_id: number;

	@ApiProperty({ description: '인그레스 URL의 마지막 조각. 웹훅 주소는 {API}/in/{slug}', example: 'k3x9q2m7w1pz8c4v6b0n' })
	slug: string;

	@ApiProperty({ example: '토스 지급대행' })
	name: string;

	@ApiProperty({ type: Object, nullable: true, description: '서명 검증 설정. null이면 검증 없이 받는다. 서명 키는 응답에 없다', example: null })
	signature_config: Prisma.JsonValue | null;

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	updated_at: Date;
}

export class SourcePageDto {
	@ApiProperty({ type: [SourceDto] })
	data: SourceDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '7' })
	next_cursor: string | null;
}
