# apps/backend

API·워커 서버. NestJS 11 + Fastify + Prisma/PostgreSQL + Valkey(ioredis). 같은 앱을
`APP_ROLE=api|consumer`로 나눠 띄운다. 루트 `CLAUDE.md`와 `docs/webhook-gateway/`가 전제다.

## 아키텍처

전체 헥사고날, 전 모듈 동일. 근거와 폴더 구조·계층별 테스트 방식은 `context-notes.md`
"코드 아키텍처" 절.

- service·consumer·scheduler·guard는 `ports/` 인터페이스만 주입받는다.
- `@prisma/client` 런타임 import, `ioredis`, `@/infra/**`는 `adapters/`와 `infra/`에서만. 타입은 `import type`.
- `domain/`은 순수 함수만. `@nestjs/*`도 import하지 않는다. 시각은 `now: Date` 인자.
- 도메인 클래스·매퍼를 만들지 않는다. Prisma 생성 타입을 그대로 쓴다.

`eslint.config.mjs`가 이 경계를 경고로 잡는다. 경고가 나면 코드를 옮기지, 규칙을 완화하지 않는다.

## 하지 않는 것

- BullMQ·Temporal 등 큐/워크플로 라이브러리. 재시도·백오프·서킷·DLQ를 직접 구현하는 게 목적이다.
- Express 전용 API. 어댑터는 Fastify다.
- `console.log`. nestjs-pino `Logger`를 주입받는다.
- 서명 시크릿·빌링키·API 키·인증 헤더를 로그에 남기는 것.
- `@/*` 외의 경로 별칭.

## 제품 규칙 중 코드에서 어기기 쉬운 것

- 인그레스(`POST /in/:slug`)는 검증·저장·XADD만 한다. 외부 HTTP 호출을 넣지 않는다.
- 워커는 at-least-once, 순서 미보장. 최대 시도 초과는 버리지 않고 `dead`로 남긴다.
- HTTP DTO는 class-validator, DB JSON 컬럼은 zod. 로그인은 구글 OAuth(비밀번호 없음), 서명
  시크릿과 빌링키는 AES-256-GCM.
- 인그레스 경로의 사용량 집계는 Valkey INCR 하나뿐이다. DB 카운트나 집계 쿼리를 넣지 않는다.

## 엔드포인트

RESTful하게 작성한다. 리소스는 URL, 행위는 HTTP 메서드로 표현한다. 아래 규칙이 그 구체화다.
근거는 `context-notes.md` "API 형식" 절. 여기 없는 형식을 새로 만들지 않는다.

### URL

- 관리 API는 두 단계. 조직 리소스는 `/orgs/:orgId/<복수 명사>`(`members`, `projects`,
  `subscription`(조직당 1개라 단수)), project 리소스는 `/orgs/:orgId/projects/:projectId/<복수 명사>`
  (`sources`, `destinations`, `connections`, `api-keys`, `events`, `deliveries`). 여러 단어는 kebab-case.
- 예외는 넷. 인그레스 `/in/:sourceSlug`, `/auth/*`, `/users/me`(내 정보·내 조직 목록), `/health`.
- URL에 동사를 쓰지 않는다. 상태를 바꾸는 액션만 `POST .../:id/<동사>`. 예: `deliveries/:id/retry`,
  `events/:id/replay`, `subscription/cancel`.
- GET 목록·단건, POST 생성(201), PATCH 부분 수정(200), DELETE 삭제(204). PUT은 쓰지 않는다.
- 컨트롤러 prefix, `@ApiTags`, 폴더 이름은 같은 단어. 클래스·파일은 단수(`source.controller.ts`).

### 인증·권한

- 전역 가드 deny-by-default. 모든 라우트에 `@Public()` 또는 `@Roles(...)` 중 하나가 있어야 한다.
  둘 다 없으면 가드가 403을 낸다. `/health`도 `@Public()`이 필요하다.
- 주체는 둘. JWT(user + membership role)와 api_key(project 고정). 핸들러는 `@Actor()`로 받는다.
  `{ kind: 'user', user_id, org_id, role } | { kind: 'api_key', org_id, project_id, api_key_id }`.
- `@Roles`는 membership role 기준이고 `owner ⊃ admin ⊃ member`. api_key는 member로 취급한다.
  멤버·결제·API 키 관리는 `@Roles('admin')` 이상이라 api_key로는 호출할 수 없다.
- `:orgId` 가드가 JWT의 membership 또는 api_key가 속한 project의 organization_id와 대조한다.
  미소속·불일치는 **404**. 타 조직 리소스 id도 404. 403은 "소속은 맞지만 role·플랜이 부족"일 때만.
- `:projectId` 가드가 project의 organization_id를 `:orgId`와, api_key면 키의 project_id와 대조한다.
  불일치는 404. role은 조직 단위뿐이라 project별 권한 검사는 없다.
- 목록·단건 조회는 항상 소속 조건(조직 리소스는 `organization_id`, project 리소스는 `project_id`)을
  건다. id만으로 조회하지 않는다.
- 플랜 게이트는 가드가 아니라 service에서 403 `plan_limit`. 예외로 "멤버 수가 상한을 넘는 조직은 owner만
  접근"만 `:orgId` 가드가 본다. 초대는 멤버 상한(free 1명, 유료 무제한) 안에서만, project 생성은
  project 상한(free 1, 유료 무제한) 안에서만, source·destination 생성은 free만 project당 각 3개, 이벤트 상한은 인그레스 429
  `usage_exceeded`. 플랜별 값은 `src/common/plan-limits.ts`.
- "세고 → 비교하고 → 만드는" 상한 검사는 조직 행을 `FOR UPDATE`로 잠근 트랜잭션 안에서 tx 클라이언트로만
  한다. 규칙은 service가 check 함수로 넘기고 adapter가 잠근 상태로 부른다(`project`·`invitation` adapter).

### 요청

- 전역 `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
- DTO는 class-validator + `@ApiProperty`(description·example). 파일은 `<module>/dto/<동사>-<명사>.dto.ts`.
  경로 파라미터도 DTO(`@Param() { id }: IdParamDto`, `@Type(() => Number)`).
- 필드 이름은 요청·응답 모두 snake_case. DB 컬럼·Prisma 타입과 같은 이름이라 매퍼가 없다.
- JSON 컬럼(`signature_config`, `headers`)은 DTO에서 zod 스키마로 파싱한다(`@IsZod(schema)`,
  `common/http/zod.ts`). class-validator로 중첩 검증하지 않는다.
- 목록 쿼리는 `cursor`(선택), `limit`(기본 50, 최대 200)에 모듈별 필터. 정렬은 `id DESC` 고정.

### 응답

- 단건은 Prisma 행 그대로. 래퍼 없음.
- 목록은 `{ data: T[], next_cursor: string | null }`. next_cursor는 마지막 행의 id. 더 없으면 null.
- 생성 201 + 행, 액션 POST 200 + 갱신된 행, 삭제 204 빈 본문.
- BigInt id(event·delivery·attempt)는 문자열로 낸다. 전역 직렬화기가 `bigint → string` 처리한다.
  커서도 문자열.
- 비밀 컬럼(`signing_secret_enc`, `billing_key_enc`, `key_hash`)은 `select`·`omit`으로 빼서 애초에 읽지
  않는다. 예외는 `destination.headers_enc`. adapter가 복호화하고 service가 비밀 값을 가려서 낸다. `@Exclude`·`ClassSerializerInterceptor`를 쓰지 않는다. api_key 원문은 생성 응답에서
  한 번만 준다.

### 오류

- `{ code, message }`. code는 snake_case 기계용, message는 한국어 사람용. 검증 실패는
  `{ code: 'validation_failed', message, details: [{ field, message }] }`.
- 커스텀 예외 클래스를 만들지 않는다. Nest 내장 예외에 객체를 넘긴다.
  `throw new NotFoundException({ code: 'source_not_found', message: '소스가 없습니다.' })`.
  전역 예외 필터가 이 형식을 그대로 내보내고, 객체 없이 던진 예외는 상태 코드별 기본 code로 바꾼다.
- 상태 코드. 400 `validation_failed`, 401 `unauthenticated`(토큰·키 없음·만료·폐기), 403
  `forbidden`·`plan_limit`, 404 `<리소스>_not_found`, 409 `<리소스>_conflict`(slug 중복 등),
  413 `payload_too_large`, 429 `rate_limited`·`usage_exceeded`.
- 인그레스 `/in/:slug`의 서명 실패는 401 `invalid_signature`, 소스 없음은 404, 정지된 project는 403
  `project_suspended`, 연결 없는 소스는 409 `no_connection`. 발신자에게 그 이상을 알려주지 않는다.
  거부 사유의 세부(서명 헤더 없음·불일치·시각 초과)는 거부 기록에만 남긴다.

### 컨트롤러 계층

- 컨트롤러는 DTO 받기 → service 한 번 호출 → 반환. 분기·조회·트랜잭션을 두지 않는다. service는
  port만 주입받는다(아키텍처 절).
- 라우트마다 `@ApiOperation({ summary })` 한국어 한 줄, 오류는 `@ApiResponse` 상태별. Bearer는
  Swagger 전역 설정이라 라우트마다 붙이지 않는다.
- 인그레스만 예외. 본문을 파싱하지 않은 바이트 그대로 받는다(`common/http/ingress-body.ts`, 10MiB 상한).
  컨트롤러는 `readIngressRequest(request)`로 읽어 service를 한 번 부른다. 그래도 한 줄이다.
- 전역 설정(ValidationPipe, 예외 필터, BigInt 직렬화, Swagger)은 첫 엔드포인트 커밋에 같이 넣는다.
  `common/`에 두고 port 의존 없이 만든다. 가드는 membership 조회가 필요하므로 `modules/auth/`에
  두고 port만 주입받는다.

### 테스트

- 컨트롤러 유닛은 service를 fake로 두고 상태 코드·응답 형식만 본다.
- e2e에 반드시 있는 세 케이스. `@Public`·`@Roles` 없는 라우트 403, 타 조직(project 리소스면 타
  project) 리소스 404, 목록 커서로 두 페이지 순회 후 null.

### .http

- 엔드포인트를 추가·변경하면 같은 커밋에 `http/<컨트롤러 prefix>.http`도 고친다. IntelliJ HTTP Client 형식.
- 요청마다 `### 한국어 한 줄` 제목. 호스트는 `{{baseUrl}}`, 인증은 `Authorization: Bearer {{token}}`.
- `token`은 `auth.http`의 로그인 응답 핸들러가 전역 변수로 저장한다. 구글 `idToken`처럼 비밀인 값은
  `http/http-client.private.env.json`(git 제외)에 `{ "local": { "idToken": "..." } }`로 넣는다.
  공개 값만 `http-client.env.json`에 둔다.
- 경로의 id(`orgId` 등)는 같은 파일 첫 요청(목록)의 응답 핸들러가 전역 변수로 저장한다. 파일 사이 의존은
  `token`뿐이고, id를 env 파일에 고정하지 않는다(autoincrement라 DB마다 다르다).
- 추가·변경한 `.http`는 서버를 띄우고 실제로 실행해 상태 코드·본문을 확인한다. CLI는
  `docker run --rm -v "$PWD/http:/workdir" jetbrains/intellij-http-client --env-file http-client.env.json
  --env local -V baseUrl=http://host.docker.internal:3001 -V token=<JWT> -L VERBOSE <파일>`.
  구글 로그인 없이 확인할 때는 `.env`의 `JWT_SECRET`으로 시드 유저 JWT(`{ sub: '<user id>' }`)를 만들어 넘긴다.

## 함정

- e2e에서 `await app.getHttpAdapter().getInstance().ready()`를 호출해야 Fastify 라우트가 뜬다.
  안 하면 404. `test/health.e2e-spec.ts`를 따른다.
- tsc는 `paths`를 산출물에 반영하지 않는다. import 구조를 바꿨으면 `pnpm build` 후
  `node dist/main`을 직접 실행해 `/health`가 뜨는지 본다. 테스트는 통과해도 런타임에서 죽는다.
- Vitest의 `unplugin-swc`를 esbuild로 바꾸면 데코레이터 메타데이터가 사라져 DI가 깨진다.
