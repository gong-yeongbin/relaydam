import { Module } from '@nestjs/common';
import { PrismaOrgRepository } from './adapters/prisma-org.repository';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { ORG_REPOSITORY } from './ports/org.repository';

@Module({
	controllers: [OrgController],
	providers: [OrgService, { provide: ORG_REPOSITORY, useClass: PrismaOrgRepository }],
})
export class OrgModule {}
