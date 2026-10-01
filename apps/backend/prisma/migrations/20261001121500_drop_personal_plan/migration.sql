-- personal 플랜 제거. 플랜을 free / team / team_plus 3단계로 줄인다. personal 행이 있으면 실패한다.
-- AlterEnum
BEGIN;
CREATE TYPE "Plan_new" AS ENUM ('free', 'team', 'team_plus');
ALTER TABLE "public"."organization" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "organization" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
ALTER TYPE "Plan" RENAME TO "Plan_old";
ALTER TYPE "Plan_new" RENAME TO "Plan";
DROP TYPE "public"."Plan_old";
ALTER TABLE "organization" ALTER COLUMN "plan" SET DEFAULT 'free';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('team', 'team_plus');
ALTER TABLE "subscription" ALTER COLUMN "plan" TYPE "SubscriptionPlan_new" USING ("plan"::text::"SubscriptionPlan_new");
ALTER TYPE "SubscriptionPlan" RENAME TO "SubscriptionPlan_old";
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";
DROP TYPE "public"."SubscriptionPlan_old";
COMMIT;
