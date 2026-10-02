import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/auth/decorators';
import { type IngressRequest, readIngressRequest } from '@/common/http/ingress-body';
import { ReceivedDto } from './dto/received.dto';
import { IngressService } from './ingress.service';

// 업체가 웹훅을 보내는 주소. 본문은 파싱하지 않은 바이트 그대로 온다(common/http/ingress-body.ts)
@ApiTags('in')
@Controller('in')
export class IngressController {
	constructor(private readonly ingress: IngressService) {}

	@Public()
	@Post(':slug')
	@HttpCode(200)
	@ApiOperation({ summary: '웹훅을 받는다. 서명 검증 → 저장 → 연결된 목적지마다 전달할 일을 만들어 큐에 넣는다. 같은 웹훅이 다시 오면 기존 이벤트 id를 준다' })
	@ApiBody({ description: '어떤 Content-Type이든 받은 바이트 그대로 저장한다. 10MiB까지', schema: { type: 'string', format: 'binary' } })
	@ApiResponse({ status: 200, type: ReceivedDto })
	@ApiResponse({ status: 401, description: 'invalid_signature' })
	@ApiResponse({ status: 403, description: 'project_suspended — 결제 실패로 정지된 프로젝트' })
	@ApiResponse({ status: 404, description: 'source_not_found' })
	@ApiResponse({ status: 409, description: 'no_connection — 연결된 목적지가 없음' })
	@ApiResponse({ status: 413, description: 'payload_too_large' })
	@ApiResponse({ status: 429, description: 'usage_exceeded — free 월 사용량 초과' })
	receive(@Param('slug') slug: string, @Req() request: IngressRequest): Promise<ReceivedDto> {
		return this.ingress.receive({ slug, ...readIngressRequest(request), now: new Date() });
	}
}
