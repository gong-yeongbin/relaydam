import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { signatureConfigSchema } from '@/modules/sources/domain/signature-config';
import type { IngressRepository, IngressSource, NewEvent, Rejection, StoredEvent } from '../ports/ingress.repository';

// (source_id, idempotency_key) 유니크
const isDuplicate = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class PrismaIngressRepository implements IngressRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly cipher: CipherService,
	) {}

	async findSourceBySlug(slug: string): Promise<IngressSource | null> {
		const row = await this.prisma.source.findUnique({
			where: { slug },
			select: {
				id: true,
				project_id: true,
				signing_secret_enc: true,
				signature_config: true,
				project: { select: { suspended_at: true, organization: { select: { id: true, plan: true } } } },
				connections: { select: { id: true, destination_id: true } },
			},
		});
		if (!row) return null;
		return {
			id: row.id,
			project_id: row.project_id,
			organization_id: row.project.organization.id,
			plan: row.project.organization.plan,
			suspended: row.project.suspended_at !== null,
			signing_secret: row.signing_secret_enc === null ? null : this.cipher.decrypt(row.signing_secret_enc),
			signature_config: row.signature_config === null ? null : signatureConfigSchema.parse(row.signature_config),
			connections: row.connections,
		};
	}

	async storeEvent(event: NewEvent): Promise<StoredEvent> {
		const { connections, body, ...columns } = event;
		try {
			return await this.prisma.$transaction(async (tx) => {
				const created = await tx.event.create({ data: { ...columns, body: new Uint8Array(body), size: body.length }, select: { id: true } });
				const deliveries = await tx.delivery.createManyAndReturn({
					data: connections.map((connection) => ({ event_id: created.id, destination_id: connection.destination_id, connection_id: connection.id })),
					select: { id: true },
				});
				return { event_id: created.id, delivery_ids: deliveries.map((delivery) => delivery.id), duplicate: false };
			});
		} catch (e) {
			if (!isDuplicate(e)) throw e;
			// 같은 웹훅이 다시 왔다. 새로 만들지 않고 처음 저장한 것을 가리킨다
			const existing = await this.prisma.event.findFirstOrThrow({
				where: { source_id: event.source_id, idempotency_key: event.idempotency_key },
				select: { id: true },
			});
			return { event_id: existing.id, delivery_ids: [], duplicate: true };
		}
	}

	async recordRejection(rejection: Rejection): Promise<void> {
		await this.prisma.rejected_request.create({ data: rejection });
	}
}
