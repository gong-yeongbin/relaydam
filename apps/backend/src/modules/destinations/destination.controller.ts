import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ListQueryDto } from '@/common/http/pagination';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { DestinationService } from './destination.service';
import { CreateDestinationDto, UpdateDestinationDto } from './dto/create-destination.dto';
import { DestinationDto, DestinationPageDto, DestinationParamDto } from './dto/get-destination.dto';

@ApiTags('destinations')
@Controller('orgs/:orgId/projects/:projectId/destinations')
export class DestinationController {
	constructor(private readonly destinations: DestinationService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '프로젝트의 목적지 목록을 조회한다' })
	@ApiResponse({ status: 200, type: DestinationPageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListQueryDto): Promise<DestinationPageDto> {
		return this.destinations.list(projectId, query);
	}

	@Roles('member')
	@Post()
	@ApiOperation({ summary: '목적지를 만든다. free는 프로젝트당 3개까지' })
	@ApiResponse({ status: 201, type: DestinationDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 403, description: 'plan_limit — 개수 상한' })
	create(@Param() { projectId }: ProjectParamDto, @Body() body: CreateDestinationDto): Promise<DestinationDto> {
		return this.destinations.create(projectId, body);
	}

	@Roles('member')
	@Get(':destinationId')
	@ApiOperation({ summary: '목적지를 조회한다' })
	@ApiResponse({ status: 200, type: DestinationDto })
	@ApiResponse({ status: 404, description: 'destination_not_found — 없거나 타 프로젝트' })
	get(@Param() { projectId, destinationId }: DestinationParamDto): Promise<DestinationDto> {
		return this.destinations.get(projectId, destinationId);
	}

	@Roles('member')
	@Patch(':destinationId')
	@ApiOperation({ summary: '목적지를 수정한다. 보내지 않은 필드는 그대로 두고 headers는 통째로 바꾼다' })
	@ApiResponse({ status: 200, type: DestinationDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	@ApiResponse({ status: 404, description: 'destination_not_found' })
	update(@Param() { projectId, destinationId }: DestinationParamDto, @Body() body: UpdateDestinationDto): Promise<DestinationDto> {
		return this.destinations.update(projectId, destinationId, body);
	}

	@Roles('member')
	@Delete(':destinationId')
	@HttpCode(204)
	@ApiOperation({ summary: '목적지를 삭제한다. 연결도 같이 지워진다' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 404, description: 'destination_not_found' })
	remove(@Param() { projectId, destinationId }: DestinationParamDto): Promise<void> {
		return this.destinations.remove(projectId, destinationId);
	}
}
