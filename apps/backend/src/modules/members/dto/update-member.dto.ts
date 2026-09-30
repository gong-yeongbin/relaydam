import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateMemberDto {
	@ApiProperty({ description: 'owner로는 바꿀 수 없다', enum: ['admin', 'member'], example: 'admin' })
	@IsIn(['admin', 'member'])
	role: 'admin' | 'member';
}
