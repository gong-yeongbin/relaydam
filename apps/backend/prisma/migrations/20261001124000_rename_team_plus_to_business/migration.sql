-- team_plus 플랜 이름을 business로 바꾼다. Prisma가 만드는 SQL은 타입을 새로 만들어 값을 잃으므로 RENAME VALUE로 직접 쓴다.
ALTER TYPE "Plan" RENAME VALUE 'team_plus' TO 'business';
ALTER TYPE "SubscriptionPlan" RENAME VALUE 'team_plus' TO 'business';
