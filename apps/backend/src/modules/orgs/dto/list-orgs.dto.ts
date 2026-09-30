import { ApiProperty } from '@nestjs/swagger';
import { OrgDto } from './get-org.dto';

export class OrgWithRoleDto extends OrgDto {
	@ApiProperty({ description: '이 조직에서 내 역할', enum: ['owner', 'admin', 'member'], example: 'owner' })
	role: 'owner' | 'admin' | 'member';
}

export class OrgPageDto {
	@ApiProperty({ type: [OrgWithRoleDto] })
	data: OrgWithRoleDto[];

	@ApiProperty({ type: String, nullable: true, description: '다음 페이지 cursor. 없으면 null', example: '12' })
	next_cursor: string | null;
}
