import { Module } from '@nestjs/common';
import { PrismaConnectionRepository } from './adapters/prisma-connection.repository';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { CONNECTION_REPOSITORY } from './ports/connection.repository';

@Module({
	controllers: [ConnectionController],
	providers: [ConnectionService, { provide: CONNECTION_REPOSITORY, useClass: PrismaConnectionRepository }],
})
export class ConnectionModule {}
