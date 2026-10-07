import { Module } from '@nestjs/common';
import { DeliveryQueueModule } from '@/modules/deliveries/delivery-queue.module';
import { IngressModule } from '@/modules/ingress/ingress.module';
import { PrismaEventRepository } from './adapters/prisma-event.repository';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EVENT_REPOSITORY } from './ports/event.repository';

// 이벤트 조회·리플레이. 리플레이는 수신과 같은 사용량 카운터를 쓰므로 IngressModule에서 받는다
@Module({
	imports: [DeliveryQueueModule, IngressModule],
	controllers: [EventController],
	providers: [EventService, { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository }],
})
export class EventModule {}
