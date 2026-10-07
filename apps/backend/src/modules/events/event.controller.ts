import { Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { EventDetailDto, EventDto, EventPageDto, EventParamDto, ListEventsQueryDto } from './dto/event.dto';
import { EventService } from './event.service';

// fastify는 직접 의존성이 아니라 reply에서 쓰는 두 메서드만 적는다
type RawReply = { header(name: string, value: string): RawReply; send(body: Buffer): unknown };

@ApiTags('events')
@Controller('orgs/:orgId/projects/:projectId/events')
export class EventController {
	constructor(private readonly events: EventService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '받은 이벤트 목록을 조회한다. source_id·received_after·received_before로 거를 수 있다. 본문은 없다' })
	@ApiResponse({ status: 200, type: EventPageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListEventsQueryDto): Promise<EventPageDto> {
		return this.events.list(projectId, query);
	}

	@Roles('member')
	@Get(':eventId')
	@ApiOperation({ summary: '이벤트와 그 전달 목록을 조회한다. 본문은 없다' })
	@ApiResponse({ status: 200, type: EventDetailDto })
	@ApiResponse({ status: 404, description: 'event_not_found — 없거나 타 프로젝트' })
	get(@Param() { projectId, eventId }: EventParamDto): Promise<EventDetailDto> {
		return this.events.get(projectId, BigInt(eventId));
	}

	// 받은 바이트를 받은 Content-Type 그대로 돌려준다. JSON 직렬화를 거치지 않으려고 reply로 직접 보낸다
	@Roles('member')
	@Get(':eventId/body')
	@ApiOperation({ summary: '이벤트 본문을 받은 바이트·Content-Type 그대로 준다' })
	@ApiProduces('application/octet-stream')
	@ApiResponse({ status: 200, description: '받은 본문 그대로' })
	@ApiResponse({ status: 404, description: 'event_not_found' })
	async body(@Param() { projectId, eventId }: EventParamDto, @Res() reply: RawReply): Promise<void> {
		const { body, content_type } = await this.events.body(projectId, BigInt(eventId));
		reply.header('content-type', content_type ?? 'application/octet-stream').send(body);
	}

	@Roles('member')
	@Post(':eventId/replay')
	@HttpCode(201)
	@ApiOperation({ summary: '이 웹훅을 새 이벤트로 다시 처리해 소스에 지금 걸린 연결들로 보낸다. 사용량에 들어간다' })
	@ApiResponse({ status: 201, type: EventDto })
	@ApiResponse({ status: 403, description: 'project_suspended' })
	@ApiResponse({ status: 404, description: 'event_not_found' })
	@ApiResponse({ status: 409, description: 'source_deleted / no_connection' })
	@ApiResponse({ status: 429, description: 'usage_exceeded — free 월 사용량 초과' })
	replay(@Param() { projectId, eventId }: EventParamDto): Promise<EventDto> {
		return this.events.replay(projectId, BigInt(eventId), new Date());
	}
}
