import { ApiProperty } from '@nestjs/swagger';

export class OrgDto {
	@ApiProperty({ example: 1 })
	id: number;

	@ApiProperty({ example: '홍길동의 조직' })
	name: string;

	@ApiProperty({ description: '현재 적용 플랜', enum: ['free', 'team', 'business'], example: 'free' })
	plan: 'free' | 'team' | 'business';

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	updated_at: Date;
}
