import type { user } from '@prisma/client';

export interface UserRepository {
	// 없으면 null
	findById(id: number): Promise<user | null>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
