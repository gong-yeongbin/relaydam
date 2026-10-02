import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

export class DestinationParamDto extends ProjectParamDto {
	@ApiProperty({ example: 3 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	destinationId: number;
}

export class DestinationDto {
	@ApiProperty({ example: 3 })
	id: number;

	@ApiProperty({ example: 10 })
	project_id: number;

	@ApiProperty({ example: '주문 서버' })
	name: string;

	@ApiProperty({ example: 'https://api.example.com/webhooks' })
	url: string;

	@ApiProperty({ type: Object, description: '전달할 때 덧붙이는 헤더. 비밀로 보이는 이름의 값은 가려져 있다', example: { Authorization: 'Bearer ****' } })
	headers: Record<string, string>;

	@ApiProperty({ example: 5000 })
	timeout_ms: number;

	@ApiProperty({ example: 10 })
	concurrency: number;

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	updated_at: Date;
}

export class DestinationPageDto {
	@ApiProperty({ type: [DestinationDto] })
	data: DestinationDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '3' })
	next_cursor: string | null;
}
