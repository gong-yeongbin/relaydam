import { Module } from '@nestjs/common';
import { PrismaSourceRepository } from './adapters/prisma-source.repository';
import { SOURCE_REPOSITORY } from './ports/source.repository';
import { SourceController } from './source.controller';
import { SourceService } from './source.service';

@Module({
	controllers: [SourceController],
	providers: [SourceService, { provide: SOURCE_REPOSITORY, useClass: PrismaSourceRepository }],
})
export class SourceModule {}
