import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ListQueryDto } from '@/common/http/pagination';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { CreateSourceDto, UpdateSourceDto } from './dto/create-source.dto';
import { SourceDto, SourcePageDto, SourceParamDto } from './dto/get-source.dto';
import { SourceService } from './source.service';

@ApiTags('sources')
@Controller('orgs/:orgId/projects/:projectId/sources')
export class SourceController {
	constructor(private readonly sources: SourceService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '프로젝트의 소스 목록을 조회한다' })
	@ApiResponse({ status: 200, type: SourcePageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListQueryDto): Promise<SourcePageDto> {
		return this.sources.list(projectId, query);
	}

	@Roles('member')
	@Post()
	@ApiOperation({ summary: '소스를 만든다. slug는 서버가 만든다. free는 프로젝트당 3개까지' })
	@ApiResponse({ status: 201, type: SourceDto })
	@ApiResponse({ status: 400, description: 'validation_failed — signing_secret과 signature_config 중 하나만 보낸 경우 포함' })
	@ApiResponse({ status: 403, description: 'plan_limit — 개수 상한' })
	create(@Param() { projectId }: ProjectParamDto, @Body() body: CreateSourceDto): Promise<SourceDto> {
		return this.sources.create(projectId, body);
	}

	@Roles('member')
	@Get(':sourceId')
	@ApiOperation({ summary: '소스를 조회한다' })
	@ApiResponse({ status: 200, type: SourceDto })
	@ApiResponse({ status: 404, description: 'source_not_found — 없거나 타 프로젝트' })
	get(@Param() { projectId, sourceId }: SourceParamDto): Promise<SourceDto> {
		return this.sources.get(projectId, sourceId);
	}

	@Roles('member')
	@Patch(':sourceId')
	@ApiOperation({ summary: '소스 이름·서명 검증 설정을 바꾼다. 보내지 않은 필드는 그대로 두고 null은 지운다' })
	@ApiResponse({ status: 200, type: SourceDto })
	@ApiResponse({ status: 400, description: 'validation_failed — 바꾼 뒤 시크릿과 설정 중 하나만 남는 경우 포함' })
	@ApiResponse({ status: 404, description: 'source_not_found' })
	update(@Param() { projectId, sourceId }: SourceParamDto, @Body() body: UpdateSourceDto): Promise<SourceDto> {
		return this.sources.update(projectId, sourceId, body);
	}

	@Roles('member')
	@Post(':sourceId/rotate-slug')
	@HttpCode(200)
	@ApiOperation({ summary: 'slug를 새로 만든다. 옛 인그레스 URL은 즉시 쓸 수 없다' })
	@ApiResponse({ status: 200, type: SourceDto })
	@ApiResponse({ status: 404, description: 'source_not_found' })
	rotateSlug(@Param() { projectId, sourceId }: SourceParamDto): Promise<SourceDto> {
		return this.sources.rotateSlug(projectId, sourceId);
	}

	@Roles('member')
	@Delete(':sourceId')
	@HttpCode(204)
	@ApiOperation({ summary: '소스를 삭제한다. 연결도 같이 지워진다' })
	@ApiResponse({ status: 204 })
	@ApiResponse({ status: 404, description: 'source_not_found' })
	remove(@Param() { projectId, sourceId }: SourceParamDto): Promise<void> {
		return this.sources.remove(projectId, sourceId);
	}
}
