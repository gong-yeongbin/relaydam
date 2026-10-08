# apps/frontend

랜딩과 대시보드. React 19 + antd 6 + react-router 7 + TanStack Query + axios. Vite, Vitest + Testing Library + MSW.
루트 `CLAUDE.md`와 `docs/webhook-gateway/`가 전제다. 화면은 하나씩 스케치로 합의한 뒤 만든다.

## 폴더

```
src/
  App.tsx          라우트 표. 화면이 늘 때마다 한 줄
  main.tsx         진입점. ConfigProvider(테마·한국어) + BrowserRouter
  theme.ts         색·글꼴 토큰. 랜딩과 대시보드가 같이 쓴다
  api/             axios 인스턴스 + 엔드포인트별 함수(events.ts, deliveries.ts …)
  auth/            토큰 보관, 로그인 상태, 보호 라우트
  components/      두 화면 이상이 쓰는 것만
  layout/          대시보드 셸(사이드바·상단 바)
  pages/<화면>/    화면 하나에 폴더 하나. 전용 컴포넌트·테스트는 안에
  test/            Vitest 셋업, MSW 핸들러
```

- 화면 전용은 `pages/<화면>/` 안에 둔다. 두 곳 이상이 쓰게 되면 그때 `components/`로 올린다. 미리 올리지 않는다.
- 폴더는 필요할 때 만든다.

## 규칙

- antd 컴포넌트를 그대로 쓴다. 색·글꼴은 `theme.ts` 한 곳. 화면마다 따로 정하지 않는다.
- 데스크톱 전용(최소 폭 1024px). 모바일 대응을 넣지 않는다.
- 상태는 서버 상태(TanStack Query)와 URL뿐이다. 전역 스토어를 두지 않는다.
- 토큰은 localStorage. 401이면 토큰을 지우고 `/login`으로.
- API 응답 필드 이름은 백엔드 DTO 그대로(snake_case). 매퍼를 두지 않는다.

## 테스트

- `MemoryRouter` 안에서 Testing Library로 "사용자가 보는 것"(role·텍스트)만 본다.
- API는 MSW로 흉내 낸다. axios를 mock하지 않는다.
- jsdom에 없는 것(`matchMedia`)은 `test/setup.ts`에서 채운다.
- `pnpm test`는 커버리지 4지표 90% 미만이면 실패한다. `main.tsx`와 `test/`만 제외.

## 하지 않는 것

- Redux·Zustand 등 전역 스토어. Tailwind. antd 밖의 UI 라이브러리.
- `any`. `console.log`.
