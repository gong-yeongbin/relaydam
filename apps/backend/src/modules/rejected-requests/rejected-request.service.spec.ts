import type { rejected_request, RejectionReason } from '@prisma/client';
import type { RejectedRequestFilter, RejectedRequestRepository } from './ports/rejected-request.repository';
import { RejectedRequestService } from './rejected-request.service';

const PROJECT = 10;

// port를 in-memory fake로 둔다. 근거는 context-notes.md "계층별 테스트".
class FakeRejections implements RejectedRequestRepository {
	rows: rejected_request[] = [];

	add(project_id: number, source_id: number | null, reason: RejectionReason) {
		this.rows.push({ id: BigInt(this.rows.length + 1), project_id, source_id, reason, headers: {}, size: 1, received_at: new Date(0) });
	}
	list(projectId: number, filter: RejectedRequestFilter, cursor: bigint | null, take: number) {
		const rows = this.rows
			.filter((r) => r.project_id === projectId && (cursor === null || r.id < cursor))
			.filter((r) => (filter.source_id === undefined || r.source_id === filter.source_id) && (filter.reason === undefined || r.reason === filter.reason))
			.sort((a, b) => Number(b.id - a.id));
		return Promise.resolve(rows.slice(0, take));
	}
}

describe('RejectedRequestService', () => {
	let repo: FakeRejections;
	let service: RejectedRequestService;

	beforeEach(() => {
		repo = new FakeRejections();
		service = new RejectedRequestService(repo);
		repo.add(PROJECT, 7, 'signature_mismatch');
		repo.add(PROJECT, 7, 'no_connection');
		repo.add(PROJECT, 8, 'signature_mismatch');
		repo.add(PROJECT + 1, 9, 'signature_mismatch');
	});

	it('그 project의 것만 id 내림차순으로 준다. 커서는 문자열 id다', async () => {
		const first = await service.list(PROJECT, { limit: 2 });
		expect(first.data.map((r) => r.id)).toEqual([3n, 2n]);
		expect(first.next_cursor).toBe('2');

		const second = await service.list(PROJECT, { limit: 2, cursor: 2 });
		expect(second.data.map((r) => r.id)).toEqual([1n]);
		expect(second.next_cursor).toBeNull();
	});

	it('source_id·reason으로 거른다', async () => {
		expect((await service.list(PROJECT, { limit: 50, source_id: 7 })).data.map((r) => r.id)).toEqual([2n, 1n]);
		expect((await service.list(PROJECT, { limit: 50, reason: 'signature_mismatch' })).data.map((r) => r.id)).toEqual([3n, 1n]);
		expect((await service.list(PROJECT, { limit: 50, source_id: 7, reason: 'no_connection' })).data.map((r) => r.id)).toEqual([2n]);
		expect((await service.list(PROJECT, { limit: 50, source_id: 9 })).data).toEqual([]);
	});
});
