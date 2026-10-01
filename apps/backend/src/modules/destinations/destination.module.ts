import { Module } from '@nestjs/common';
import { PrismaDestinationRepository } from './adapters/prisma-destination.repository';
import { DestinationController } from './destination.controller';
import { DestinationService } from './destination.service';
import { DESTINATION_REPOSITORY } from './ports/destination.repository';

@Module({
	controllers: [DestinationController],
	providers: [DestinationService, { provide: DESTINATION_REPOSITORY, useClass: PrismaDestinationRepository }],
})
export class DestinationModule {}
