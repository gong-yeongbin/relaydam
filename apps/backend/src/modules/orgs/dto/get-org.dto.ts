import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class OrgIdParamDto {
	@ApiProperty({ example: 1 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	orgId: number;
}

export class OrgDto {
	@ApiProperty({ example: 1 })
	id: number;

	@ApiProperty({ example: '홍길동의 조직' })
	name: string;

	@ApiProperty({ description: '현재 적용 플랜', enum: ['free', 'personal', 'team', 'team_plus'], example: 'free' })
	plan: 'free' | 'personal' | 'team' | 'team_plus';

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	updated_at: Date;
}
