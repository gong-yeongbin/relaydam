import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { ENDPOINT_LIMIT } from '@/common/plan-limits';
import type { SignatureConfig } from './domain/signature-config';
import { newSlug } from './domain/slug';
import { SOURCE_REPOSITORY, type SourceRepository, type SourceView } from './ports/source.repository';

const NOT_FOUND = { code: 'source_not_found', message: '소스가 없습니다.' };

type SourceInput = { name?: string; signing_secret?: string | null; signature_config?: SignatureConfig | null };

@Injectable()
export class SourceService {
	constructor(@Inject(SOURCE_REPOSITORY) private readonly sources: SourceRepository) {}

	// async여야 검증·상한 예외가 동기 예외가 아니라 Promise 거부로 나간다
	async create(projectId: number, input: SourceInput & { name: string }): Promise<SourceView> {
		const signature = { signing_secret: input.signing_secret ?? null, signature_config: input.signature_config ?? null };
		this.assertBothOrNeither(signature.signing_secret !== null, signature.signature_config !== null);
		return this.sources.create(projectId, { name: input.name, slug: newSlug(), ...signature }, ({ plan, count }) => {
			if (count >= ENDPOINT_LIMIT[plan]) {
				throw new ForbiddenException({ code: 'plan_limit', message: `현재 플랜은 프로젝트마다 소스를 ${ENDPOINT_LIMIT[plan]}개까지 만들 수 있습니다.` });
			}
		});
	}

	async list(projectId: number, query: ListQueryDto): Promise<Page<SourceView>> {
		return toPage(await this.sources.list(projectId, query.cursor ?? null, query.limit + 1), query.limit, (s) => s.id);
	}

	async get(projectId: number, id: number): Promise<SourceView> {
		return (await this.sources.find(projectId, id)) ?? this.notFound();
	}

	// 보내지 않은 필드는 그대로 둔다. 시크릿·설정에 null을 보내면 지운다. 바꾼 뒤에도 둘 다 있거나 둘 다 없어야 한다
	async update(projectId: number, id: number, input: SourceInput): Promise<SourceView> {
		// 시크릿은 읽지 않지만 설정이 있으면 시크릿도 있다(DB CHECK)
		const verifying = (await this.get(projectId, id)).signature_config !== null;
		this.assertBothOrNeither(
			input.signing_secret === undefined ? verifying : input.signing_secret !== null,
			input.signature_config === undefined ? verifying : input.signature_config !== null,
		);
		const data = { name: input.name ?? undefined, signing_secret: input.signing_secret, signature_config: input.signature_config };
		return (await this.sources.update(projectId, id, data)) ?? this.notFound();
	}

	// 유출됐을 때 URL을 바꾼다. 옛 slug는 즉시 쓸 수 없다
	async rotateSlug(projectId: number, id: number): Promise<SourceView> {
		return (await this.sources.update(projectId, id, { slug: newSlug() })) ?? this.notFound();
	}

	// 받은 event 처리는 그 테이블이 생기는 7. ingress에서 정한다
	async remove(projectId: number, id: number): Promise<void> {
		if (!(await this.sources.remove(projectId, id))) this.notFound();
	}

	private assertBothOrNeither(hasSecret: boolean, hasConfig: boolean): void {
		if (hasSecret === hasConfig) return;
		throw new BadRequestException({
			code: 'validation_failed',
			message: '요청이 올바르지 않습니다.',
			details: [{ field: hasSecret ? 'signature_config' : 'signing_secret', message: 'signing_secret과 signature_config는 둘 다 있거나 둘 다 없어야 합니다.' }],
		});
	}

	private notFound(): never {
		throw new NotFoundException(NOT_FOUND);
	}
}
