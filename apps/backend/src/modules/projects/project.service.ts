import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { PROJECT_LIMIT } from '@/common/plan-limits';
import { newSigningSecret } from './domain/signing-secret';
import { PROJECT_REPOSITORY, type ProjectRepository, type ProjectView } from './ports/project.repository';

const NOT_FOUND = { code: 'project_not_found', message: '프로젝트가 없습니다.' };

@Injectable()
export class ProjectService {
	constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

	async create(orgId: number, input: { name: string }): Promise<ProjectView> {
		// 전달 요청에 찍을 서명 키를 같이 만든다
		const created = await this.projects.create(orgId, { name: input.name, signing_secret: newSigningSecret() }, ({ plan, count }) => {
			if (count >= PROJECT_LIMIT[plan]) throw new ForbiddenException({ code: 'plan_limit', message: `현재 플랜은 프로젝트를 ${PROJECT_LIMIT[plan]}개까지 만들 수 있습니다.` });
		});
		return created === 'name_conflict' ? this.conflict() : created;
	}

	async list(orgId: number, query: ListQueryDto): Promise<Page<ProjectView>> {
		return toPage(await this.projects.list(orgId, query.cursor ?? null, query.limit + 1), query.limit, (p) => p.id);
	}

	async get(orgId: number, id: number): Promise<ProjectView> {
		return (await this.projects.find(orgId, id)) ?? this.notFound();
	}

	async update(orgId: number, id: number, data: { name?: string }): Promise<ProjectView> {
		const updated = await this.projects.update(orgId, id, data);
		if (updated === 'name_conflict') return this.conflict();
		return updated ?? this.notFound();
	}

	// 안의 소스·목적지·이벤트·전달 기록이 전부 같이 지워진다(FK cascade)
	async remove(orgId: number, id: number): Promise<void> {
		if (!(await this.projects.remove(orgId, id))) this.notFound();
	}

	// 고객 서버가 서명을 확인하려면 키를 알아야 해서 조회가 된다.
	// 서명 키가 생기기 전에 만든 project는 키가 없다. 처음 조회할 때 만든다
	async getSigningSecret(orgId: number, id: number): Promise<{ signing_secret: string }> {
		const secret = await this.projects.findSigningSecret(orgId, id);
		if (secret === undefined) return this.notFound();
		return secret === null ? this.rotateSigningSecret(orgId, id) : { signing_secret: secret };
	}

	// 새 키로 바꾼다. 옛 키로 찍은 서명은 그 뒤 전달부터 나오지 않는다
	async rotateSigningSecret(orgId: number, id: number): Promise<{ signing_secret: string }> {
		const signing_secret = newSigningSecret();
		if (!(await this.projects.setSigningSecret(orgId, id, signing_secret))) this.notFound();
		return { signing_secret };
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}

	private conflict(): never {
		throw new ConflictException({ code: 'project_conflict', message: '같은 이름의 프로젝트가 있습니다.' });
	}
}
