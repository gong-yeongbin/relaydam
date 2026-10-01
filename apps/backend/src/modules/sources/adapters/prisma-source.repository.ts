import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { CreateCheck, Signature, SourceRepository, SourceView } from '../ports/source.repository';

const omit = { signing_secret_enc: true } as const;

@Injectable()
export class PrismaSourceRepository implements SourceRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly cipher: CipherService,
	) {}

	create(projectId: number, data: { name: string; slug: string } & Signature, check: CreateCheck): Promise<SourceView> {
		return this.prisma.$transaction(async (tx) => {
			// 같은 조직의 생성을 줄 세운다. 개수를 센 뒤 만들기 전에 다른 요청이 끼어들지 못한다
			await tx.$queryRaw`SELECT o.id FROM organization o JOIN project p ON p.organization_id = o.id WHERE p.id = ${projectId} FOR UPDATE OF o`;
			const [project, count] = await Promise.all([
				tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { organization: { select: { plan: true } } } }),
				tx.source.count({ where: { project_id: projectId } }),
			]);
			check({ plan: project.organization.plan, count });
			return tx.source.create({ data: { project_id: projectId, name: data.name, slug: data.slug, ...this.signatureColumns(data) }, omit });
		});
	}

	list(projectId: number, cursor: number | null, take: number): Promise<SourceView[]> {
		return this.prisma.source.findMany({
			where: { project_id: projectId, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
			omit,
		});
	}

	find(projectId: number, id: number): Promise<SourceView | null> {
		return this.prisma.source.findFirst({ where: { id, project_id: projectId }, omit });
	}

	async update(projectId: number, id: number, data: { name?: string; slug?: string } & Partial<Signature>): Promise<SourceView | null> {
		const { count } = await this.prisma.source.updateMany({
			where: { id, project_id: projectId },
			data: { name: data.name, slug: data.slug, ...this.signatureColumns(data) },
		});
		return count > 0 ? this.find(projectId, id) : null;
	}

	async remove(projectId: number, id: number): Promise<boolean> {
		const { count } = await this.prisma.source.deleteMany({ where: { id, project_id: projectId } });
		return count > 0;
	}

	// undefined인 쪽은 건드리지 않는다. 시크릿은 암호화하고, 설정을 비울 때는 JSON null이 아니라 DB NULL을 써야
	// CHECK(source_signature_both_or_neither)를 통과한다
	private signatureColumns(data: Partial<Signature>) {
		return {
			...(data.signing_secret === undefined ? {} : { signing_secret_enc: data.signing_secret === null ? null : this.cipher.encrypt(data.signing_secret) }),
			...(data.signature_config === undefined ? {} : { signature_config: data.signature_config ?? Prisma.DbNull }),
		};
	}
}
