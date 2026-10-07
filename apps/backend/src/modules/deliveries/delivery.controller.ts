import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/auth/decorators';
import { ProjectParamDto } from '@/modules/projects/dto/get-project.dto';
import { DeliveryService } from './delivery.service';
import { BulkRetryDto, BulkRetryResultDto, DeliveryDetailDto, DeliveryDto, DeliveryPageDto, DeliveryParamDto, ListDeliveriesQueryDto } from './dto/delivery.dto';

@ApiTags('deliveries')
@Controller('orgs/:orgId/projects/:projectId/deliveries')
export class DeliveryController {
	constructor(private readonly deliveries: DeliveryService) {}

	@Roles('member')
	@Get()
	@ApiOperation({ summary: '전달 목록을 조회한다. status·destination_id·event_id로 거를 수 있다' })
	@ApiResponse({ status: 200, type: DeliveryPageDto })
	list(@Param() { projectId }: ProjectParamDto, @Query() query: ListDeliveriesQueryDto): Promise<DeliveryPageDto> {
		return this.deliveries.list(projectId, query);
	}

	@Roles('member')
	@Post('retry')
	@HttpCode(200)
	@ApiOperation({ summary: '조건에 맞는 전달을 한꺼번에 다시 보낸다. 한 번에 최대 1,000건. 더 있으면 다시 부른다' })
	@ApiResponse({ status: 200, type: BulkRetryResultDto })
	@ApiResponse({ status: 400, description: 'validation_failed' })
	bulkRetry(@Param() { projectId }: ProjectParamDto, @Body() body: BulkRetryDto): Promise<BulkRetryResultDto> {
		return this.deliveries.bulkRetry(projectId, body);
	}

	@Roles('member')
	@Get(':deliveryId')
	@ApiOperation({ summary: '전달과 그 시도 기록을 조회한다' })
	@ApiResponse({ status: 200, type: DeliveryDetailDto })
	@ApiResponse({ status: 404, description: 'delivery_not_found — 없거나 타 프로젝트' })
	get(@Param() { projectId, deliveryId }: DeliveryParamDto): Promise<DeliveryDetailDto> {
		return this.deliveries.get(projectId, BigInt(deliveryId));
	}

	@Roles('member')
	@Post(':deliveryId/retry')
	@HttpCode(200)
	@ApiOperation({ summary: '이 전달을 지금 다시 보낸다. 시도 횟수는 이어진다. 성공한 것도 다시 보낼 수 있다' })
	@ApiResponse({ status: 200, type: DeliveryDto })
	@ApiResponse({ status: 404, description: 'delivery_not_found' })
	@ApiResponse({ status: 409, description: 'delivery_pending — 처리 중' })
	retry(@Param() { projectId, deliveryId }: DeliveryParamDto): Promise<DeliveryDto> {
		return this.deliveries.retry(projectId, BigInt(deliveryId));
	}

	@Roles('member')
	@Post(':deliveryId/cancel')
	@HttpCode(200)
	@ApiOperation({ summary: '예정된 재시도를 멈추고 취소한다' })
	@ApiResponse({ status: 200, type: DeliveryDto })
	@ApiResponse({ status: 404, description: 'delivery_not_found' })
	@ApiResponse({ status: 409, description: 'delivery_closed — 이미 끝남' })
	cancel(@Param() { projectId, deliveryId }: DeliveryParamDto): Promise<DeliveryDto> {
		return this.deliveries.cancel(projectId, BigInt(deliveryId));
	}
}
