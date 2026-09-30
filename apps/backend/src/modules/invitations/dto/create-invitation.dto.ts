import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, MaxLength } from 'class-validator';

export class CreateInvitationDto {
	@ApiProperty({ description: '초대받는 사람의 구글 계정 이메일. 소문자로 저장한다', maxLength: 255, example: 'kim@example.com' })
	@IsEmail()
	@MaxLength(255)
	email: string;

	@ApiProperty({ description: 'owner로는 초대할 수 없다', enum: ['admin', 'member'], example: 'member' })
	@IsIn(['admin', 'member'])
	role: 'admin' | 'member';
}
