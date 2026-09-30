import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { OrgIdParamDto } from '@/common/http/params';

export class MemberParamDto extends OrgIdParamDto {
	@ApiProperty({ example: 3 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	userId: number;
}

class MemberUserDto {
	@ApiProperty({ example: 3 })
	id: number;

	@ApiProperty({ example: 'kim@example.com' })
	email: string;

	@ApiProperty({ example: '김철수' })
	name: string;

	@ApiProperty({ type: String, nullable: true, example: 'https://lh3.googleusercontent.com/a/...' })
	avatar_url: string | null;
}

export class MemberDto {
	@ApiProperty({ example: 1 })
	organization_id: number;

	@ApiProperty({ example: 3 })
	user_id: number;

	@ApiProperty({ enum: ['owner', 'admin', 'member'], example: 'member' })
	role: 'owner' | 'admin' | 'member';

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	updated_at: Date;

	@ApiProperty({ type: MemberUserDto })
	user: MemberUserDto;
}

export class MemberPageDto {
	@ApiProperty({ type: [MemberDto] })
	data: MemberDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor(user_id). 없으면 null', example: '3' })
	next_cursor: string | null;
}
