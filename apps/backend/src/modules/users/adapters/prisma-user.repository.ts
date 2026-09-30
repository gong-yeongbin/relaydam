import { Injectable } from '@nestjs/common';
import type { user } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { UserRepository } from '../ports/user.repository';

@Injectable()
export class PrismaUserRepository implements UserRepository {
	constructor(private readonly prisma: PrismaService) {}

	findById(id: number): Promise<user | null> {
		return this.prisma.user.findUnique({ where: { id } });
	}
}
