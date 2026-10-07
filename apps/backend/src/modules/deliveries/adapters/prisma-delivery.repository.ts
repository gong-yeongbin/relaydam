import { Injectable } from '@nestjs/common';
import { CipherService } from '@/infra/cipher/cipher.service';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { headersSchema } from '@/modules/destinations/domain/headers';
import { newSigningSecret } from '@/modules/projects/domain/signing-secret';
import type { AttemptRecord, DeliveryContext, DeliveryOutcome, DeliveryRepository } from '../ports/delivery.repository';

// 아직 끝나지 않은 상태. 이 상태일 때만 워커가 손댄다
const OPEN = ['pending', 'failed'] as const;

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly cipher: CipherService,
	) {}

	async load(id: bigint): Promise<DeliveryContext | null> {
		const row = await this.prisma.delivery.findUnique({
			where: { id },
			select: {
				id: true,
				status: true,
				attempt: true,
				created_at: true,
				event: {
					select: {
						id: true,
						method: true,
						path: true,
						query: true,
						source_ip: true,
						verified: true,
						headers: true,
						body: true,
						source: { select: { name: true } },
						project: { select: { id: true, organization_id: true, suspended_at: true, signing_secret_enc: true } },
					},
				},
				destination: { select: { id: true, name: true, url: true, headers_enc: true, timeout_ms: true, concurrency: true } },
				connection: { select: { retry_strategy: true, retry_interval_ms: true, retry_count: true, paused_at: true } },
			},
		});
		if (!row) return null;
		const { event, destination, connection } = row;
		return {
			id: row.id,
			status: row.status,
			attempt: row.attempt,
			created_at: row.created_at,
			event: {
				id: event.id,
				method: event.method,
				path: event.path,
				query: event.query,
				source_ip: event.source_ip,
				verified: event.verified,
				// 인그레스가 받은 헤더를 그대로 넣은 값이다(이름 → 문자열 또는 문자열 배열)
				headers: event.headers as Record<string, string | string[]>,
				body: Buffer.from(event.body),
				source_name: event.source?.name ?? null,
			},
			project: {
				id: event.project.id,
				organization_id: event.project.organization_id,
				suspended: event.project.suspended_at !== null,
				signing_secret: await this.signingSecret(event.project.id, event.project.signing_secret_enc),
			},
			destination: destination && {
				id: destination.id,
				name: destination.name,
				url: destination.url,
				headers: destination.headers_enc === null ? {} : headersSchema.parse(JSON.parse(this.cipher.decrypt(destination.headers_enc))),
				timeout_ms: destination.timeout_ms,
				concurrency: destination.concurrency,
			},
			connection: connection && {
				retry_strategy: connection.retry_strategy,
				retry_interval_ms: connection.retry_interval_ms,
				retry_count: connection.retry_count,
				paused: connection.paused_at !== null,
			},
		};
	}

	async recordAttempt(id: bigint, attemptBefore: number, attempt: AttemptRecord, outcome: DeliveryOutcome): Promise<boolean> {
		return this.prisma.$transaction(async (tx) => {
			const { count } = await tx.delivery.updateMany({
				where: { id, attempt: attemptBefore, status: { in: [...OPEN] } },
				data: { attempt: attempt.attempt_no, ...outcome },
			});
			if (count === 0) return false;
			await tx.delivery_attempt.create({ data: { delivery_id: id, ...attempt } });
			return true;
		});
	}

	async close(id: bigint, status: 'held' | 'canceled' | 'dead', error?: string): Promise<void> {
		await this.prisma.delivery.updateMany({ where: { id, status: { in: [...OPEN] } }, data: { status, next_attempt_at: null, last_error: error } });
	}

	async defer(id: bigint, at: Date): Promise<void> {
		await this.prisma.delivery.updateMany({ where: { id, status: { in: [...OPEN] } }, data: { next_attempt_at: at } });
	}

	async findStale(now: Date, staleMs: number, limit: number): Promise<bigint[]> {
		const cutoff = new Date(now.getTime() - staleMs);
		const rows = await this.prisma.delivery.findMany({
			where: {
				updated_at: { lt: cutoff },
				// pending은 큐에 있어야 하고, failed는 예약 시각이 지났으면 이미 다시 큐에 들어갔어야 한다
				OR: [{ status: 'pending' }, { status: 'failed', next_attempt_at: { lt: cutoff } }],
			},
			select: { id: true },
			orderBy: { id: 'asc' },
			take: limit,
		});
		const ids = rows.map((row) => row.id);
		if (ids.length > 0) await this.prisma.delivery.updateMany({ where: { id: { in: ids } }, data: { updated_at: now } });
		return ids;
	}

	// 서명 키가 생기기 전에 만든 project는 키가 없다. 처음 서명할 때 만든다
	private async signingSecret(projectId: number, encrypted: string | null): Promise<string> {
		if (encrypted !== null) return this.cipher.decrypt(encrypted);
		const secret = newSigningSecret();
		await this.prisma.project.update({ where: { id: projectId }, data: { signing_secret_enc: this.cipher.encrypt(secret) } });
		return secret;
	}
}
