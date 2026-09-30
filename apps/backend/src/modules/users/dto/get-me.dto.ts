import { ApiProperty } from '@nestjs/swagger';

export class MeDto {
	@ApiProperty({ example: 1 })
	id: number;

	@ApiProperty({ description: '구글 계정 이메일', example: 'a@example.com' })
	email: string;

	@ApiProperty({ description: '구글 프로필 이름', example: '홍길동' })
	name: string;

	@ApiProperty({ description: '구글 프로필 사진 URL', type: String, nullable: true, example: 'https://lh3.googleusercontent.com/a/...' })
	avatar_url: string | null;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	created_at: Date;

	@ApiProperty({ example: '2026-09-30T00:00:00.000Z' })
	updated_at: Date;
}
