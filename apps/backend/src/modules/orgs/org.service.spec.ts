import { NotFoundException } from '@nestjs/common';
import type { organization } from '@prisma/client';
import type { OrgRepository, OrgWithRole } from './ports/org.repository';
import { OrgService } from './org.service';

const org = (id: number): organization => ({ id, name: `org-${id}`, plan: 'free', created_at: new Date(0), updated_at: new Date(0) });

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeOrgs implements OrgRepository {
	orgs = new Map([1, 2, 3].map((id) => [id, org(id)]));
	// user 7은 조직 1·2·3 소속
	memberships = [1, 2, 3].map((id) => ({ user_id: 7, organization_id: id, role: 'member' as const }));

	listByMember(userId: number, cursor: number | null, take: number): Promise<OrgWithRole[]> {
		const rows = this.memberships
			.filter((m) => m.user_id === userId && (cursor === null || m.organization_id < cursor))
			.sort((a, b) => b.organization_id - a.organization_id)
			.slice(0, take)
			.map((m) => ({ ...this.orgs.get(m.organization_id)!, role: m.role }));
		return Promise.resolve(rows);
	}
	findById(id: number) {
		return Promise.resolve(this.orgs.get(id) ?? null);
	}
	update(id: number, data: { name?: string }) {
		const updated = { ...this.orgs.get(id)!, ...data };
		this.orgs.set(id, updated);
		return Promise.resolve(updated);
	}
}

describe('OrgService', () => {
	it('list — 소속 조직을 id 내림차순으로 페이지 나눠 준다', async () => {
		const service = new OrgService(new FakeOrgs());

		const first = await service.list(7, { limit: 2 });
		expect(first.data.map((o) => o.id)).toEqual([3, 2]);
		expect(first.next_cursor).toBe('2');

		const second = await service.list(7, { limit: 2, cursor: 2 });
		expect(second).toEqual({ data: [expect.objectContaining({ id: 1, role: 'member' })], next_cursor: null });
	});

	it('get — 조직 행을 준다', async () => {
		expect(await new OrgService(new FakeOrgs()).get(1)).toEqual(org(1));
	});

	it('get — 없으면 404 organization_not_found', async () => {
		const error = await new OrgService(new FakeOrgs()).get(99).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NotFoundException);
		expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'organization_not_found' });
	});

	it('update — 이름을 바꾼 행을 준다', async () => {
		expect(await new OrgService(new FakeOrgs()).update(1, { name: '새 이름' })).toMatchObject({ id: 1, name: '새 이름' });
	});
});
