import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { ListRejectedRequestsQueryDto, RejectedRequestPageDto } from './dto/rejected-request.dto';
import { RejectedRequestService } from './rejected-request.service';

// 인그레스가 거부한 요청을 본다. "왜 웹훅이 안 들어오는지" 확인하는 용도다. 읽기 전용이다
@ApiTags('rejected-requests')
@Controller('orgs/:orgId/projects/:projectId/rejected-requests')
export class RejectedRequestController {
	constructor(private readonly rejections: RejectedRequestService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '거부된 요청 목록을 조회한다. source_id·reason으로 거를 수 있다. 소스당 분당 10건까지만 기록된다' })
	@ApiResponse({ status: 200, type: RejectedRequestPageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListRejectedRequestsQueryDto): Promise<RejectedRequestPageDto> {
		return this.rejections.list(projectId, query);
	}
}
