import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Actor, Roles } from '@/common/auth/decorators';
import { ListQueryDto } from '@/common/http/pagination';
import { OrgIdParamDto } from '@/common/http/params';
import { AcceptedMemberDto, InvitationTokenParamDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationDto, InvitationPageDto, InvitationParamDto } from './dto/list-invitations.dto';
import { InvitationService } from './invitation.service';

@ApiTags('invitations')
@Controller('orgs/:orgId/invitations')
export class InvitationController {
	constructor(private readonly invitations: InvitationService) {}

	@Roles('admin')
	@Get()
	@ApiOperation({ summary: '대기 중인 초대 목록을 조회한다(만료된 것 포함)' })
	@ApiResponse({ status: 200, type: InvitationPageDto })
	@ApiResponse({ status: 403, description: 'forbidden — admin 미만' })
	list(@Param() { orgId }: OrgIdParamDto, @Query() query: ListQueryDto): Promise<InvitationPageDto> {
		return this.invitations.list(orgId, query);
	}

	@Roles('admin')
	@Post()
	@ApiOperation({ summary: '이메일로 초대하고 메일을 보낸다. 같은 이메일이면 새 토큰으로 다시 보낸다' })
	@ApiResponse({ status: 201, type: InvitationDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 403, description: 'forbidden — admin 미만 / plan_limit — 멤버 + 대기 초대가 상한' })
	@ApiResponse({ status: 409, description: 'member_conflict — 이미 멤버' })
	create(@Actor() actor: Actor, @Param() { orgId }: OrgIdParamDto, @Body() body: CreateInvitationDto): Promise<InvitationDto> {
		return this.invitations.create(actor, orgId, body);
	}

	@Roles('admin')
	@Delete(':invitationId')
	@HttpCode(204)
	@ApiOperation({ summary: '초대를 취소한다' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 404, description: 'invitation_not_found' })
	cancel(@Param() { orgId, invitationId }: InvitationParamDto): Promise<void> {
		return this.invitations.cancel(orgId, invitationId);
	}
}

// 수락하는 사람은 아직 멤버가 아니라 :orgId 가드를 통과할 수 없다. 그래서 /orgs 밖에 둔다
@ApiTags('invitations')
@Controller('invitations')
export class InvitationAcceptController {
	constructor(private readonly invitations: InvitationService) {}

	@Roles()
	@Post(':token/accept')
	@HttpCode(200)
	@ApiOperation({ summary: '초대를 수락해 조직 멤버가 된다. 로그인 계정 이메일이 초대 이메일과 같아야 한다' })
	@ApiResponse({ status: 200, type: AcceptedMemberDto })
	@ApiResponse({ status: 403, description: 'forbidden — 초대 이메일과 다른 계정' })
	@ApiResponse({ status: 404, description: 'invitation_not_found — 없거나 만료' })
	accept(@Actor() actor: Actor, @Param() { token }: InvitationTokenParamDto): Promise<AcceptedMemberDto> {
		return this.invitations.accept(actor, token);
	}
}
