import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InvitationTokenParamDto {
	@ApiProperty({ description: '초대 메일 링크에 담긴 토큰', example: 'q3J9...' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	token: string;
}

export class AcceptedMemberDto {
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
}
