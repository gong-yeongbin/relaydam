import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { project } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { PROJECT_LIMIT } from '@/common/plan-limits';
import { PROJECT_REPOSITORY, type ProjectRepository } from './ports/project.repository';

const NOT_FOUND = { code: 'project_not_found', message: '프로젝트가 없습니다.' };

@Injectable()
export class ProjectService {
	constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

	async create(orgId: number, input: { name: string }): Promise<project> {
		const created = await this.projects.create(orgId, input.name, ({ plan, count }) => {
			if (count >= PROJECT_LIMIT[plan]) throw new ForbiddenException({ code: 'plan_limit', message: `현재 플랜은 프로젝트를 ${PROJECT_LIMIT[plan]}개까지 만들 수 있습니다.` });
		});
		return created === 'name_conflict' ? this.conflict() : created;
	}

	async list(orgId: number, query: ListQueryDto): Promise<Page<project>> {
		return toPage(await this.projects.list(orgId, query.cursor ?? null, query.limit + 1), query.limit, (p) => p.id);
	}

	async get(orgId: number, id: number): Promise<project> {
		return (await this.projects.find(orgId, id)) ?? this.notFound();
	}

	async update(orgId: number, id: number, data: { name?: string }): Promise<project> {
		const updated = await this.projects.update(orgId, id, data);
		if (updated === 'name_conflict') return this.conflict();
		return updated ?? this.notFound();
	}

	// 하위 소스·이벤트 처리는 그 테이블이 생기는 6단계에서 정한다
	async remove(orgId: number, id: number): Promise<void> {
		if (!(await this.projects.remove(orgId, id))) this.notFound();
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}

	private conflict(): never {
		throw new ConflictException({ code: 'project_conflict', message: '같은 이름의 프로젝트가 있습니다.' });
	}
}
