import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles } from '@/common/auth/decorators';
import { ListQueryDto } from '@/common/http/pagination';
import { OrgDto, OrgIdParamDto } from './dto/get-org.dto';
import { OrgPageDto } from './dto/list-orgs.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { OrgService } from './org.service';

@ApiTags('orgs')
@Controller('orgs')
export class OrgController {
	constructor(private readonly orgs: OrgService) {}

	@Roles()
	@Get()
	@ApiOperation({ summary: '내가 속한 조직 목록을 내 역할과 함께 조회한다' })
	@ApiResponse({ status: 200, type: OrgPageDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	list(@Actor() actor: Actor, @Query() query: ListQueryDto): Promise<OrgPageDto> {
		return this.orgs.list(actor.user_id, query);
	}

	@Roles('member')
	@Get(':orgId')
	@ApiOperation({ summary: '조직을 조회한다' })
	@ApiResponse({ status: 200, type: OrgDto })
	@ApiResponse({ status: 404, description: 'organization_not_found — 없거나 소속이 아님' })
	get(@Param() { orgId }: OrgIdParamDto): Promise<OrgDto> {
		return this.orgs.get(orgId);
	}

	@Roles('admin')
	@Patch(':orgId')
	@ApiOperation({ summary: '조직 이름을 바꾼다' })
	@ApiResponse({ status: 200, type: OrgDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 403, description: 'forbidden — admin 미만' })
	@ApiResponse({ status: 404, description: 'organization_not_found — 없거나 소속이 아님' })
	update(@Param() { orgId }: OrgIdParamDto, @Body() body: UpdateOrgDto): Promise<OrgDto> {
		return this.orgs.update(orgId, body);
	}
}
