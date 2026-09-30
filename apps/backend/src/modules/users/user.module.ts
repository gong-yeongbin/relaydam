import { Module } from '@nestjs/common';
import { PrismaUserRepository } from './adapters/prisma-user.repository';
import { USER_REPOSITORY } from './ports/user.repository';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
	controllers: [UserController],
	providers: [UserService, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
})
export class UserModule {}
