-- 같은 조직 안에서 project 이름은 대소문자를 무시하고 유일하다. 식 인덱스라 Prisma 스키마로 표현할 수 없어 직접 추가한다.
CREATE UNIQUE INDEX "project_organization_id_lower_name_key" ON "project"("organization_id", lower("name"));
