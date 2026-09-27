// 로컬 개발용 시드. Node 24가 타입을 지우고 바로 실행한다(`prisma db seed` → `node prisma/seed.mts`).
// 그래서 enum·파라미터 프로퍼티처럼 타입 제거만으로 안 되는 문법을 쓰지 않는다.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const SEED_EMAIL = 'seed@relaydam.local';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main(): Promise<void> {
	// 조직에는 유니크 키가 없어 upsert할 수 없다. 시드 유저가 있으면 이미 시드된 DB로 보고 건너뛴다.
	if (await prisma.user.findUnique({ where: { email: SEED_EMAIL } })) {
		console.log('시드 유저가 이미 있어 건너뜁니다.');
		return;
	}

	const now = new Date();
	const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

	await prisma.$transaction(async (tx) => {
		const user = await tx.user.create({
			data: {
				email: SEED_EMAIL,
				name: '시드 유저',
				identities: { create: { provider: 'google', provider_user_id: 'seed-google-sub' } },
			},
		});

		// 첫 로그인 때 생기는 개인 조직과 같은 모양. free라 subscription이 없다.
		await tx.organization.create({
			data: {
				name: '시드 유저의 조직',
				plan: 'free',
				members: { create: { user_id: user.id, role: 'owner' } },
			},
		});

		await tx.organization.create({
			data: {
				name: '시드 팀',
				plan: 'team',
				members: { create: { user_id: user.id, role: 'owner' } },
				subscription: {
					create: {
						plan: 'team',
						status: 'active',
						customer_key: 'seed-customer-key',
						// 암호화 모듈(4. billing) 전이라 복호화할 수 없는 자리표시값이다. 결제 배치에 쓰지 않는다.
						billing_key_enc: 'seed-placeholder',
						card_issuer_code: '11',
						card_number_masked: '1234-****-****-5678',
						current_period_start: periodStart,
						current_period_end: periodEnd,
					},
				},
			},
		});
	});

	console.log('시드 완료: 유저 1, 조직 2(free, team), 구독 1');
}

try {
	await main();
} finally {
	await prisma.$disconnect();
}
