import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { CreateCheck, ProjectRepository, ProjectView } from '../ports/project.repository';

// 이름 유니크는 식 인덱스 project_organization_id_lower_name_key(마이그레이션 SQL)가 강제한다
const isNameConflict = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const omit = { signing_secret_enc: true } as const;

@Injectable()
export class PrismaProjectRepository implements ProjectRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly cipher: CipherService,
	) {}

	async create(orgId: number, data: { name: string; signing_secret: string }, check: CreateCheck): Promise<ProjectView | 'name_conflict'> {
		try {
			return await this.prisma.$transaction(async (tx) => {
				// 같은 조직의 생성·초대를 줄 세운다. 개수를 센 뒤 만들기 전에 다른 요청이 끼어들지 못한다
				await tx.$queryRaw`SELECT id FROM organization WHERE id = ${orgId} FOR UPDATE`;
				const [org, count] = await Promise.all([
					tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } }),
					tx.project.count({ where: { organization_id: orgId } }),
				]);
				check({ plan: org.plan, count });
				return tx.project.create({ data: { organization_id: orgId, name: data.name, signing_secret_enc: this.cipher.encrypt(data.signing_secret) }, omit });
			});
		} catch (e) {
			if (isNameConflict(e)) return 'name_conflict';
			throw e;
		}
	}

	list(orgId: number, cursor: number | null, take: number): Promise<ProjectView[]> {
		return this.prisma.project.findMany({
			where: { organization_id: orgId, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
			omit,
		});
	}

	find(orgId: number, id: number): Promise<ProjectView | null> {
		return this.prisma.project.findFirst({ where: { id, organization_id: orgId }, omit });
	}

	async update(orgId: number, id: number, data: { name?: string }): Promise<ProjectView | null | 'name_conflict'> {
		try {
			const { count } = await this.prisma.project.updateMany({ where: { id, organization_id: orgId }, data });
			return count > 0 ? this.find(orgId, id) : null;
		} catch (e) {
			if (isNameConflict(e)) return 'name_conflict';
			throw e;
		}
	}

	async remove(orgId: number, id: number): Promise<boolean> {
		const { count } = await this.prisma.project.deleteMany({ where: { id, organization_id: orgId } });
		return count > 0;
	}

	async findSigningSecret(orgId: number, id: number): Promise<string | null | undefined> {
		const row = await this.prisma.project.findFirst({ where: { id, organization_id: orgId }, select: { signing_secret_enc: true } });
		if (!row) return undefined;
		return row.signing_secret_enc === null ? null : this.cipher.decrypt(row.signing_secret_enc);
	}

	async setSigningSecret(orgId: number, id: number, secret: string): Promise<boolean> {
		const { count } = await this.prisma.project.updateMany({ where: { id, organization_id: orgId }, data: { signing_secret_enc: this.cipher.encrypt(secret) } });
		return count > 0;
	}
}
