import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { organization } from '@prisma/client';
import { type ListQueryDto, type Page, toPage } from '@/common/http/pagination';
import { ORG_REPOSITORY, type OrgRepository, type OrgWithRole } from './ports/org.repository';

@Injectable()
export class OrgService {
	constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}

	async list(userId: number, query: ListQueryDto): Promise<Page<OrgWithRole>> {
		return toPage(await this.orgs.listByMember(userId, query.cursor ?? null, query.limit + 1), query.limit, (o) => o.id);
	}

	async get(orgId: number): Promise<organization> {
		const found = await this.orgs.findById(orgId);
		if (!found) throw new NotFoundException({ code: 'organization_not_found', message: '조직이 없습니다.' });
		return found;
	}

	update(orgId: number, data: { name?: string }): Promise<organization> {
		return this.orgs.update(orgId, data);
	}
}
