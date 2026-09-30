import { Module } from '@nestjs/common';
import { PrismaProjectRepository } from './adapters/prisma-project.repository';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { PROJECT_REPOSITORY } from './ports/project.repository';

@Module({
	controllers: [ProjectController],
	providers: [ProjectService, { provide: PROJECT_REPOSITORY, useClass: PrismaProjectRepository }],
})
export class ProjectModule {}
