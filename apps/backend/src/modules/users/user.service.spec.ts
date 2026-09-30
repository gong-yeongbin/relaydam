import { NotFoundException } from '@nestjs/common';
import type { user } from '@prisma/client';
import type { UserRepository } from './ports/user.repository';
import { UserService } from './user.service';

const USER: user = {
	id: 7,
	email: 'a@example.com',
	name: 'A',
	avatar_url: null,
	created_at: new Date('2026-09-30T00:00:00Z'),
	updated_at: new Date('2026-09-30T00:00:00Z'),
};

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
const users: UserRepository = { findById: (id) => Promise.resolve(id === USER.id ? USER : null) };

describe('UserService.getMe', () => {
	it('user 행을 그대로 돌려준다', async () => {
		expect(await new UserService(users).getMe(7)).toEqual(USER);
	});

	it('토큰은 유효한데 user 행이 없으면 404 user_not_found', async () => {
		const error = await new UserService(users).getMe(8).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NotFoundException);
		expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'user_not_found' });
	});
});
