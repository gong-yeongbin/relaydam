import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles } from '@/common/auth/decorators';
import { ListQueryDto } from '@/common/http/pagination';
import { OrgIdParamDto } from '@/common/http/params';
import { MemberDto, MemberPageDto, MemberParamDto } from './dto/list-members.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MemberService } from './member.service';

@ApiTags('members')
@Controller('orgs/:orgId/members')
export class MemberController {
	constructor(private readonly members: MemberService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '조직 멤버 목록을 조회한다' })
	@ApiResponse({ status: 200, type: MemberPageDto })
	@ApiResponse({ status: 403, description: 'plan_limit — 멤버 수가 플랜 상한을 넘어 owner만 접근' })
	@ApiResponse({ status: 404, description: 'organization_not_found' })
	list(@Param() { orgId }: OrgIdParamDto, @Query() query: ListQueryDto): Promise<MemberPageDto> {
		return this.members.list(orgId, query);
	}

	@Roles('admin')
	@Patch(':userId')
	@ApiOperation({ summary: '멤버 역할을 admin·member 사이에서 바꾼다' })
	@ApiResponse({ status: 200, type: MemberDto })
	@ApiResponse({ status: 400, description: 'validation_failed — owner로는 바꿀 수 없다' })
	@ApiResponse({ status: 403, description: 'forbidden — admin 미만이거나 대상이 owner' })
	@ApiResponse({ status: 404, description: 'organization_not_found·member_not_found' })
	changeRole(@Param() { orgId, userId }: MemberParamDto, @Body() body: UpdateMemberDto): Promise<MemberDto> {
		return this.members.changeRole(orgId, userId, body.role);
	}

	@Roles('member')
	@Delete(':userId')
	@HttpCode(204)
	@ApiOperation({ summary: '멤버를 내보내거나 스스로 나간다' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 403, description: 'forbidden — 다른 멤버를 내보내려면 admin 이상, owner는 대상이 될 수 없다' })
	@ApiResponse({ status: 404, description: 'organization_not_found·member_not_found' })
	remove(@Actor() actor: Actor, @Param() { orgId, userId }: MemberParamDto): Promise<void> {
		return this.members.remove(actor, orgId, userId);
	}
}
