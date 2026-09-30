import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

// 경로 파라미터 DTO. :orgId는 가드가 먼저 보지만 핸들러는 이 DTO로 숫자를 받는다
export class OrgIdParamDto {
	@ApiProperty({ example: 1 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	orgId: number;
}
