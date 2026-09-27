import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
const SEED_EMAIL = 'seed@relaydam.local';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
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
}
finally {
    await prisma.$disconnect();
}
//# sourceMappingURL=seed.mjs.map