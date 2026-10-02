import { Module } from '@nestjs/common';
import { DeliveryQueueModule } from '@/modules/deliveries/delivery-queue.module';
import { PrismaConnectionRepository } from './adapters/prisma-connection.repository';
import { QueuedHeldDeliveries } from './adapters/queued-held-deliveries';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { CONNECTION_REPOSITORY } from './ports/connection.repository';
import { HELD_DELIVERIES } from './ports/held-deliveries';

@Module({
	imports: [DeliveryQueueModule],
	controllers: [ConnectionController],
	providers: [
		ConnectionService,
		{ provide: CONNECTION_REPOSITORY, useClass: PrismaConnectionRepository },
		{ provide: HELD_DELIVERIES, useClass: QueuedHeldDeliveries },
	],
})
export class ConnectionModule {}
