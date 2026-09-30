import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { OrgIdParamDto } from '@/common/http/params';

export class InvitationParamDto extends OrgIdParamDto {
	@ApiProperty({ example: 5 })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	invitationId: number;
}

export class InvitationDto {
	@ApiProperty({ example: 5 })
	id: number;

	@ApiProperty({ example: 1 })
	organization_id: number;

	@ApiProperty({ example: 'kim@example.com' })
	email: string;

	@ApiProperty({ enum: ['admin', 'member'], example: 'member' })
	role: 'admin' | 'member';

	@ApiProperty({ description: '지나면 수락할 수 없다(발송 후 7일)', example: '2026-10-07T00:00:00.000Z' })
	expires_at: Date;

	@ApiProperty({ example: 1 })
	invited_by_user_id: number;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ description: '재초대하면 갱신된다', example: '2026-09-30T00:00:00.000Z' })
	updated_at: Date;
}

export class InvitationPageDto {
	@ApiProperty({ type: [InvitationDto] })
	data: InvitationDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '5' })
	next_cursor: string | null;
}
