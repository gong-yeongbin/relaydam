import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
	@ApiProperty({ description: '프로젝트 이름', maxLength: 100, example: 'shop' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;
}

export class UpdateProjectDto {
	@ApiPropertyOptional({ description: '프로젝트 이름', maxLength: 100, example: 'shop-prod' })
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name?: string;
}
