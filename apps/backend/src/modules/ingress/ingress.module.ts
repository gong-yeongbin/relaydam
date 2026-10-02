import { Module } from '@nestjs/common';
import { PrismaIngressRepository } from './adapters/prisma-ingress.repository';
import { ValkeyDeliveryQueue } from './adapters/valkey-delivery.queue';
import { ValkeyIngressCounters } from './adapters/valkey-ingress.counters';
import { IngressController } from './ingress.controller';
import { IngressService } from './ingress.service';
import { DELIVERY_QUEUE } from './ports/delivery.queue';
import { INGRESS_COUNTERS } from './ports/ingress.counters';
import { INGRESS_REPOSITORY } from './ports/ingress.repository';

@Module({
	controllers: [IngressController],
	providers: [
		IngressService,
		{ provide: INGRESS_REPOSITORY, useClass: PrismaIngressRepository },
		{ provide: INGRESS_COUNTERS, useClass: ValkeyIngressCounters },
		{ provide: DELIVERY_QUEUE, useClass: ValkeyDeliveryQueue },
	],
})
export class IngressModule {}
