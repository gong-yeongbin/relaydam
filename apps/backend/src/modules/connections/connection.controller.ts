import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { ConnectionService } from './connection.service';
import { ConnectionDto, ConnectionPageDto, ConnectionParamDto, CreateConnectionDto, ListConnectionsQueryDto, UpdateConnectionDto } from './dto/connection.dto';

@ApiTags('connections')
@Controller('orgs/:orgId/projects/:projectId/connections')
export class ConnectionController {
	constructor(private readonly connections: ConnectionService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '프로젝트의 연결 목록을 조회한다. source_id·destination_id로 거를 수 있다' })
	@ApiResponse({ status: 200, type: ConnectionPageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListConnectionsQueryDto): Promise<ConnectionPageDto> {
		return this.connections.list(projectId, query);
	}

	@Roles('member')
	@Post()
	@ApiOperation({ summary: '소스와 목적지를 잇는다. 둘 다 이 프로젝트의 것이어야 한다. 재시도 설정을 안 보내면 2배씩·5분·9회다' })
	@ApiResponse({ status: 201, type: ConnectionDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 404, description: 'source_not_found / destination_not_found — 없거나 타 프로젝트' })
	@ApiResponse({ status: 409, description: 'connection_conflict — 이미 이어져 있음' })
	create(@Param() { projectId }: ProjectParamDto, @Body() body: CreateConnectionDto): Promise<ConnectionDto> {
		return this.connections.create(projectId, body);
	}

	@Roles('member')
	@Get(':connectionId')
	@ApiOperation({ summary: '연결을 조회한다' })
	@ApiResponse({ status: 200, type: ConnectionDto })
	@ApiResponse({ status: 404, description: 'connection_not_found — 없거나 타 프로젝트' })
	get(@Param() { projectId, connectionId }: ConnectionParamDto): Promise<ConnectionDto> {
		return this.connections.get(projectId, connectionId);
	}

	@Roles('member')
	@Patch(':connectionId')
	@ApiOperation({ summary: '재시도 설정을 바꾼다. 보내지 않은 필드는 그대로 둔다. 다른 목적지로 잇고 싶으면 지우고 새로 만든다' })
	@ApiResponse({ status: 200, type: ConnectionDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 404, description: 'connection_not_found' })
	update(@Param() { projectId, connectionId }: ConnectionParamDto, @Body() body: UpdateConnectionDto): Promise<ConnectionDto> {
		return this.connections.update(projectId, connectionId, body);
	}

	@Roles('member')
	@Post(':connectionId/pause')
	@HttpCode(200)
	@ApiOperation({ summary: '전달을 일시 정지한다. 그동안 웹훅은 받아 저장하고 전달만 보류한다' })
	@ApiResponse({ status: 200, type: ConnectionDto })
	@ApiResponse({ status: 404, description: 'connection_not_found' })
	pause(@Param() { projectId, connectionId }: ConnectionParamDto): Promise<ConnectionDto> {
		return this.connections.pause(projectId, connectionId, new Date());
	}

	@Roles('member')
	@Post(':connectionId/unpause')
	@HttpCode(200)
	@ApiOperation({ summary: '일시 정지를 풀고 보류해 둔 전달을 이어서 보낸다' })
	@ApiResponse({ status: 200, type: ConnectionDto })
	@ApiResponse({ status: 404, description: 'connection_not_found' })
	unpause(@Param() { projectId, connectionId }: ConnectionParamDto): Promise<ConnectionDto> {
		return this.connections.unpause(projectId, connectionId);
	}

	@Roles('member')
	@Delete(':connectionId')
	@HttpCode(204)
	@ApiOperation({ summary: '연결을 끊는다. 소스와 목적지는 남는다' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 404, description: 'connection_not_found' })
	remove(@Param() { projectId, connectionId }: ConnectionParamDto): Promise<void> {
		return this.connections.remove(projectId, connectionId);
	}
}
