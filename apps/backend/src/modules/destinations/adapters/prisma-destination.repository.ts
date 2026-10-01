import { Injectable } from '@nestjs/common';
import type { destination } from '@prisma/client';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { type DestinationHeaders, headersSchema } from '../domain/headers';
import type { CreateCheck, DestinationRecord, DestinationRepository, DestinationWrite } from '../ports/destination.repository';

@Injectable()
export class PrismaDestinationRepository implements DestinationRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly cipher: CipherService,
	) {}

	create(projectId: number, data: DestinationWrite, check: CreateCheck): Promise<DestinationRecord> {
		return this.prisma.$transaction(async (tx) => {
			// 같은 조직의 생성을 줄 세운다. 개수를 센 뒤 만들기 전에 다른 요청이 끼어들지 못한다
			await tx.$queryRaw`SELECT o.id FROM organization o JOIN project p ON p.organization_id = o.id WHERE p.id = ${projectId} FOR UPDATE OF o`;
			const [project, count] = await Promise.all([
				tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { organization: { select: { plan: true } } } }),
				tx.destination.count({ where: { project_id: projectId } }),
			]);
			check({ plan: project.organization.plan, count });
			return this.toRecord(await tx.destination.create({ data: { project_id: projectId, ...this.columns(data) } }));
		});
	}

	async list(projectId: number, cursor: number | null, take: number): Promise<DestinationRecord[]> {
		const rows = await this.prisma.destination.findMany({
			where: { project_id: projectId, ...(cursor === null ? {} : { id: { lt: cursor } }) },
			orderBy: { id: 'desc' },
			take,
		});
		return rows.map((row) => this.toRecord(row));
	}

	async find(projectId: number, id: number): Promise<DestinationRecord | null> {
		const row = await this.prisma.destination.findFirst({ where: { id, project_id: projectId } });
		return row && this.toRecord(row);
	}

	async update(projectId: number, id: number, data: Partial<DestinationWrite>): Promise<DestinationRecord | null> {
		const { count } = await this.prisma.destination.updateMany({ where: { id, project_id: projectId }, data: this.columns(data) });
		return count > 0 ? this.find(projectId, id) : null;
	}

	async remove(projectId: number, id: number): Promise<boolean> {
		const { count } = await this.prisma.destination.deleteMany({ where: { id, project_id: projectId } });
		return count > 0;
	}

	// headers는 암호화한다. 헤더가 없으면 빈 객체를 암호화하지 않고 NULL로 둔다. undefined면 건드리지 않는다
	private columns<T extends Partial<DestinationWrite>>({ headers, ...rest }: T) {
		return { ...rest, ...(headers === undefined ? {} : { headers_enc: this.encryptHeaders(headers) }) };
	}

	private encryptHeaders(headers: DestinationHeaders): string | null {
		return Object.keys(headers).length === 0 ? null : this.cipher.encrypt(JSON.stringify(headers));
	}

	private toRecord({ headers_enc, ...row }: destination): DestinationRecord {
		return { ...row, headers: headers_enc === null ? {} : headersSchema.parse(JSON.parse(this.cipher.decrypt(headers_enc))) };
	}
}
