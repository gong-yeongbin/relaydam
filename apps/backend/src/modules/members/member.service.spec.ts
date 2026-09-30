import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import type { Actor } from '@/common/auth/decorators';
import { MemberService } from './member.service';
import type { MemberRepository, MemberWithUser } from './ports/member.repository';

const ORG = 1;
const member = (user_id: number, role: MemberRole): MemberWithUser => ({
	organization_id: ORG,
	user_id,
	role,
	created_at: new Date(0),
	updated_at: new Date(0),
	user: { id: user_id, email: `${user_id}@example.com`, name: `u${user_id}`, avatar_url: null },
});

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeMembers implements MemberRepository {
	rows = new Map<number, MemberWithUser>([
		[1, member(1, 'owner')],
		[2, member(2, 'admin')],
		[3, member(3, 'member')],
		[4, member(4, 'member')],
	]);

	list(_orgId: number, cursor: number | null, take: number) {
		const rows = [...this.rows.values()].filter((m) => cursor === null || m.user_id < cursor).sort((a, b) => b.user_id - a.user_id);
		return Promise.resolve(rows.slice(0, take));
	}
	find(_orgId: number, userId: number) {
		return Promise.resolve(this.rows.get(userId) ?? null);
	}
	updateRole(_orgId: number, userId: number, role: MemberRole) {
		const updated = { ...this.rows.get(userId)!, role };
		this.rows.set(userId, updated);
		return Promise.resolve(updated);
	}
	remove(_orgId: number, userId: number) {
		this.rows.delete(userId);
		return Promise.resolve();
	}
}

const actor = (user_id: number, role: MemberRole): Actor => ({ kind: 'user', user_id, org_id: ORG, role });

async function codeOf(promise: Promise<unknown>) {
	const error = await promise.catch((e: unknown) => e);
	return { type: (error as object).constructor, code: (error as ForbiddenException).getResponse?.() };
}

describe('MemberService', () => {
	let repo: FakeMembers;
	let service: MemberService;

	beforeEach(() => {
		repo = new FakeMembers();
		service = new MemberService(repo);
	});

	it('list — user_id 내림차순, user_id를 커서로', async () => {
		const first = await service.list(ORG, { limit: 3 });
		expect(first.data.map((m) => m.user_id)).toEqual([4, 3, 2]);
		expect(first.next_cursor).toBe('2');
		expect((await service.list(ORG, { limit: 3, cursor: 2 })).data.map((m) => m.user_id)).toEqual([1]);
	});

	describe('changeRole', () => {
		it('admin·member 사이로 바꾼다', async () => {
			expect(await service.changeRole(ORG, 3, 'admin')).toMatchObject({ user_id: 3, role: 'admin' });
		});

		it('owner의 역할은 바꿀 수 없다 — 403', async () => {
			expect(await codeOf(service.changeRole(ORG, 1, 'member'))).toEqual({ type: ForbiddenException, code: expect.objectContaining({ code: 'forbidden' }) as object });
		});

		it('없는 멤버는 404 member_not_found', async () => {
			expect(await codeOf(service.changeRole(ORG, 99, 'admin'))).toEqual({ type: NotFoundException, code: expect.objectContaining({ code: 'member_not_found' }) as object });
		});
	});

	describe('remove', () => {
		it('member도 스스로 나갈 수 있다', async () => {
			await service.remove(actor(3, 'member'), ORG, 3);
			expect(repo.rows.has(3)).toBe(false);
		});

		it('admin은 다른 멤버를 내보낸다', async () => {
			await service.remove(actor(2, 'admin'), ORG, 4);
			expect(repo.rows.has(4)).toBe(false);
		});

		it('member가 다른 멤버를 내보내면 403', async () => {
			expect((await codeOf(service.remove(actor(3, 'member'), ORG, 4))).type).toBe(ForbiddenException);
			expect(repo.rows.has(4)).toBe(true);
		});

		it('owner는 내보낼 수도, 스스로 나갈 수도 없다 — 403', async () => {
			expect((await codeOf(service.remove(actor(2, 'admin'), ORG, 1))).type).toBe(ForbiddenException);
			expect((await codeOf(service.remove(actor(1, 'owner'), ORG, 1))).type).toBe(ForbiddenException);
			expect(repo.rows.has(1)).toBe(true);
		});

		it('없는 멤버는 404', async () => {
			expect((await codeOf(service.remove(actor(2, 'admin'), ORG, 99))).type).toBe(NotFoundException);
		});
	});
});
