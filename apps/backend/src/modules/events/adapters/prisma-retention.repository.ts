import { Injectable } from '@nestjs/common';
import type { Plan } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { RetentionRepository } from '../ports/retention.repository';

// 조직 플랜은 project를 거쳐 본다. 한 문장으로 "고르고 지우기"를 해 배치 사이에 플랜이 바뀌어도 그 시점의 플랜을 따른다
@Injectable()
export class PrismaRetentionRepository implements RetentionRepository {
	constructor(private readonly prisma: PrismaService) {}

	deleteExpiredEvents(plan: Plan, cutoff: Date, limit: number): Promise<number> {
		return this.prisma.$executeRaw`
			DELETE FROM event WHERE id IN (
				SELECT e.id FROM event e
				JOIN project p ON p.id = e.project_id
				JOIN organization o ON o.id = p.organization_id
				WHERE o.plan = ${plan}::"Plan" AND e.received_at < ${cutoff}
				ORDER BY e.id LIMIT ${limit}
			)`;
	}

	deleteExpiredRejections(plan: Plan, cutoff: Date, limit: number): Promise<number> {
		return this.prisma.$executeRaw`
			DELETE FROM rejected_request WHERE id IN (
				SELECT r.id FROM rejected_request r
				JOIN project p ON p.id = r.project_id
				JOIN organization o ON o.id = p.organization_id
				WHERE o.plan = ${plan}::"Plan" AND r.received_at < ${cutoff}
				ORDER BY r.id LIMIT ${limit}
			)`;
	}
}
