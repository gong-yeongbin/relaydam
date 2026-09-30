import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { user } from '@prisma/client';
import { USER_REPOSITORY, type UserRepository } from './ports/user.repository';

@Injectable()
export class UserService {
	constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

	async getMe(userId: number): Promise<user> {
		const found = await this.users.findById(userId);
		// JWT는 서명만 검증하므로 행이 지워진 뒤에도 만료 전까지 유효하다
		if (!found) throw new NotFoundException({ code: 'user_not_found', message: '유저가 없습니다.' });
		return found;
	}
}
