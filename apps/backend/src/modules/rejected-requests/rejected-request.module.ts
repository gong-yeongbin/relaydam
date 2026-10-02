import { Module } from '@nestjs/common';
import { PrismaRejectedRequestRepository } from './adapters/prisma-rejected-request.repository';
import { REJECTED_REQUEST_REPOSITORY } from './ports/rejected-request.repository';
import { RejectedRequestController } from './rejected-request.controller';
import { RejectedRequestService } from './rejected-request.service';

@Module({
	controllers: [RejectedRequestController],
	providers: [RejectedRequestService, { provide: REJECTED_REQUEST_REPOSITORY, useClass: PrismaRejectedRequestRepository }],
})
export class RejectedRequestModule {}
