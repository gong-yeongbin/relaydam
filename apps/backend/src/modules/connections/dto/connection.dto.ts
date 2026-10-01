import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ListQueryDto } from '@/common/http/pagination';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';

export class CreateConnectionDto {
	@ApiProperty({ description: '이 프로젝트의 소스 id', example: 7 })
	@IsInt()
	@Min(1)
	source_id: number;

	@ApiProperty({ description: '이 프로젝트의 목적지 id', example: 3 })
	@IsInt()
	@Min(1)
	destination_id: number;
}

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

	@ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
	created_at: Date;
}

export class ConnectionPageDto {
	@ApiProperty({ type: [ConnectionDto] })
	data: ConnectionDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '12' })
	next_cursor: string | null;
}
