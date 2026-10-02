import { Module } from '@nestjs/common';
import { DeliveryQueueModule } from '@/modules/deliveries/delivery-queue.module';
import { PrismaIngressRepository } from './adapters/prisma-ingress.repository';
import { ValkeyIngressCounters } from './adapters/valkey-ingress.counters';
import { IngressController } from './ingress.controller';
import { IngressService } from './ingress.service';
import { INGRESS_COUNTERS } from './ports/ingress.counters';
import { INGRESS_REPOSITORY } from './ports/ingress.repository';

@Module({
	imports: [DeliveryQueueModule],
	controllers: [IngressController],
	providers: [
		IngressService,
		{ provide: INGRESS_REPOSITORY, useClass: PrismaIngressRepository },
		{ provide: INGRESS_COUNTERS, useClass: ValkeyIngressCounters },
	],
})
export class IngressModule {}
