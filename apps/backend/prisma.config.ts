import { defineConfig } from 'prisma/config';

// Prisma 7은 datasource URL을 schema.prisma에 둘 수 없어 여기서 주입한다.
// prisma.config.ts가 있으면 CLI가 .env를 자동 로드하지 않으므로 직접 읽는다.
try {
	process.loadEnvFile();
} catch {
	// .env가 없으면 셸 환경 변수의 DATABASE_URL을 그대로 쓴다
}

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'node prisma/seed.mts',
	},
	datasource: {
		url: process.env.DATABASE_URL,
	},
});
