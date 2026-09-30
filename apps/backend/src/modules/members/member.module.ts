import { Module } from '@nestjs/common';
import { PrismaMemberRepository } from './adapters/prisma-member.repository';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { MEMBER_REPOSITORY } from './ports/member.repository';

@Module({
	controllers: [MemberController],
	providers: [MemberService, { provide: MEMBER_REPOSITORY, useClass: PrismaMemberRepository }],
})
export class MemberModule {}
