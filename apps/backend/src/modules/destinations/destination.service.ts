import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { ENDPOINT_LIMIT } from '@/common/plan-limits';
import { type DestinationHeaders, maskHeaders } from './domain/headers';
import { DESTINATION_REPOSITORY, type DestinationRecord, type DestinationRepository } from './ports/destination.repository';

const NOT_FOUND = { code: 'destination_not_found', message: '목적지가 없습니다.' };

// 응답으로 나가는 모양. headers의 비밀 값은 가려져 있다
export type DestinationView = DestinationRecord;

type DestinationInput = { name?: string; url?: string; headers?: DestinationHeaders | null; timeout_ms?: number; concurrency?: number };

const toView = (record: DestinationRecord): DestinationView => ({ ...record, headers: maskHeaders(record.headers) });

@Injectable()
export class DestinationService {
	constructor(@Inject(DESTINATION_REPOSITORY) private readonly destinations: DestinationRepository) {}

	async create(projectId: number, input: DestinationInput & { name: string; url: string }): Promise<DestinationView> {
		const data = { name: input.name, url: input.url, headers: input.headers ?? {}, ...this.limits(input) };
		const created = await this.destinations.create(projectId, data, ({ plan, count }) => {
			if (count >= ENDPOINT_LIMIT[plan]) {
				throw new ForbiddenException({ code: 'plan_limit', message: `현재 플랜은 프로젝트마다 목적지를 ${ENDPOINT_LIMIT[plan]}개까지 만들 수 있습니다.` });
			}
		});
		return toView(created);
	}

	async list(projectId: number, query: ListQueryDto): Promise<Page<DestinationView>> {
		const rows = await this.destinations.list(projectId, query.cursor ?? null, query.limit + 1);
		return toPage(rows.map(toView), query.limit, (d) => d.id);
	}

	async get(projectId: number, id: number): Promise<DestinationView> {
		return toView((await this.destinations.find(projectId, id)) ?? this.notFound());
	}

	// 보내지 않은 필드는 그대로 둔다. headers는 통째로 바뀌고 null·빈 객체면 지운다
	async update(projectId: number, id: number, input: DestinationInput): Promise<DestinationView> {
		const data = {
			name: input.name ?? undefined,
			url: input.url ?? undefined,
			headers: input.headers === undefined ? undefined : (input.headers ?? {}),
			...this.limits(input),
		};
		return toView((await this.destinations.update(projectId, id, data)) ?? this.notFound());
	}

	// 전달 기록 처리는 그 테이블이 생기는 7. ingress에서 정한다
	async remove(projectId: number, id: number): Promise<void> {
		if (!(await this.destinations.remove(projectId, id))) this.notFound();
	}

	// null은 "보내지 않음"과 같게 본다(@IsOptional이 null을 통과시킨다)
	private limits(input: DestinationInput) {
		return { timeout_ms: input.timeout_ms ?? undefined, concurrency: input.concurrency ?? undefined };
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
