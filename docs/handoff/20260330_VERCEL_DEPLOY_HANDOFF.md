# 2026-03-30 Vercel 배포 handoff

## 목적

이 문서는 2026-03-30 기준 구현 상태를 바탕으로,
다음 작업자가 바로 `Vercel preview 배포`를 이어서 할 수 있도록
실행 순서, 필요한 환경변수, 확인 포인트를 정리한 handoff 문서다.

## 오늘 기준 결론

- `Supabase Auth` 연결 완료
- `Supabase Postgres` 연결 완료
- `Supabase Storage` asset backend 연결 완료
- local data import 완료
  - `games 6`
  - `game_content 6`
  - `sessions 21`
- local asset import 완료
  - bucket `game-assets`
  - asset files `15`
- `npm run build` 통과
- asset route smoke test 통과

즉, 현재 남은 큰 작업은 구현보다 `Vercel project 연결 + env 설정 + preview 배포 + 실사용 QA` 다.

## 현재 기준 체크포인트 커밋

- `09bb65c`
  - `feat: move game assets to supabase storage`

이 커밋까지 push 된 상태를 기준으로 이어서 작업하면 된다.

## 관련 핵심 파일

### 상태/문서

- [현재 상태 요약](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/handoff/20260330_LIBRARY_MAKER_ACCESS_STATUS.md)
- [접근 분리 백로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- [Vercel + Supabase 배포 검토](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md)
- [작업 로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/ai_history/20260330_0924_MakerUserSessionAndAccessMeta_Report.md)

### 인증 / 저장소 설정

- [maker auth config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/maker-auth-config.ts)
- [persistence config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/persistence-config.ts)
- [asset storage boundary](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/game-asset-storage.ts)
- [env example](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/.env.example)

### Supabase schema / migration

- [profiles migration](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/supabase/migrations/20260330_000001_create_profiles.sql)
- [games migration](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/supabase/migrations/20260330_000002_create_games_and_game_content.sql)
- [sessions migration](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/supabase/migrations/20260330_000003_create_sessions.sql)

## 현재 런타임 전제

운영/배포 기준 환경은 아래 조합이다.

```env
MAKER_AUTH_PROVIDER="supabase"
APP_PERSISTENCE_PROVIDER="supabase"
```

즉:

- 메이커 인증은 Supabase Auth
- 게임/세션 데이터는 Supabase Postgres
- 이미지 자산은 Supabase Storage
- Next 앱은 Vercel

## Vercel에 넣어야 할 환경변수

최소 필수:

```env
MAKER_AUTH_PROVIDER="supabase"
APP_PERSISTENCE_PROVIDER="supabase"
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."
SUPABASE_ASSETS_BUCKET="game-assets"
```

조건부:

```env
MAKER_ACCESS_PASSWORD="..."
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5-mini"
OPENAI_REASONING_EFFORT="low"
OPENAI_ASSISTANT_ENABLED="true"
```

메모:

- 현재 코드상 alias도 지원한다.
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY`
- 하지만 Vercel에는 alias보다 실제 사용값으로 아래 이름을 넣는 쪽이 안전하다.
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

근거 파일:

- [maker auth config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/maker-auth-config.ts)
- [persistence config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/persistence-config.ts)
- [env example](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/.env.example)

## Vercel 연결 절차

최신 Vercel 문서 기준으로,

- Git 연결 프로젝트는 branch push마다 preview deployment가 생성된다.
- 환경변수는 Project Settings > Environment Variables 에서 넣고,
  변경 후에는 새 배포에만 반영된다.

참고:

- [Deploying Git Repositories with Vercel](https://vercel.com/docs/deployments/git)
- [Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables)
- [vercel env](https://vercel.com/docs/cli/env)

### 1. 프로젝트 연결

터미널에서 프로젝트 루트 기준:

```bash
vercel link
```

또는 Git repo 연결 기준이면:

```bash
vercel link --repo
```

연결이 끝나면 `.vercel/project.json` 또는 `.vercel/repo.json` 이 생긴다.

현재 상태:

- `.vercel` 디렉토리는 아직 없음
- 즉 아직 Vercel project link 전 상태

### 2. Vercel dashboard에서 env 입력

1. Vercel dashboard 열기
2. Project 선택
3. `Settings`
4. `Environment Variables`
5. 아래 변수들을 `Preview` 와 `Production` 둘 다 넣기

필수 변수 목록:

- `MAKER_AUTH_PROVIDER`
- `APP_PERSISTENCE_PROVIDER`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ASSETS_BUCKET`

옵션 변수:

- `MAKER_ACCESS_PASSWORD`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_ASSISTANT_ENABLED`

중요:

- Vercel 문서 기준 env 변경은 이전 배포에 소급 적용되지 않는다.
- env를 바꿨으면 반드시 새 preview deploy를 다시 만들어야 한다.

### 3. preview 배포

추천은 Git 기반 preview다.

즉:

1. 변경 커밋
2. branch push
3. Vercel preview URL 확인

Git 연결이 안 되어 있으면 CLI로도 가능하다.

```bash
vercel deploy
```

하지만 장기적으로는 Git 기반 preview가 더 낫다.

## 배포 후 가장 먼저 확인할 QA

### 1. 메이커 로그인

- `/maker-access`
- `REDACTED_LOGIN` 계정 로그인 가능해야 함
- 로그인 후 `/library/manage` 진입 가능해야 함

### 2. 기존 게임 목록

- imported 게임이 보이는지 확인
- 대표적으로 아래 게임이 관리 화면에서 보여야 함
  - `에덴의 조각들`
  - `마지막 페이지`

### 3. 게임 저장

- 게임 하나 수정
- 저장
- 새로고침 후 유지

이건 `Supabase DB write` 검증이다.

### 4. 이미지 업로드

- 표지 또는 플레이어 이미지 1개 업로드
- 저장
- 새로고침 후 유지

이건 `Supabase Storage write + asset route read` 검증이다.

### 5. 공개 라이브러리

- 비로그인 상태에서 `/library`
- 공개 게임만 보이는지 확인

### 6. 비회원 참가

- 공개 게임으로 세션 시작
- 다른 브라우저/모바일에서 `/join/<세션코드>`
- 로그인 없이 참가 가능해야 함

이건 현재 제품 정책상 필수다.

### 7. 재참가 / 새로고침

- 플레이어 참가 후 새로고침
- 재진입 가능해야 함

## 문제가 생기면 먼저 볼 것

### 1. 빌드 실패

먼저 로컬에서:

```bash
npm run build
```

현재 기준 이건 통과한다.

### 2. 메이커 로그인 실패

확인 파일:

- [maker auth config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/maker-auth-config.ts)
- [middleware](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/middleware.ts)
- [supabase middleware helper](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/supabase/middleware.ts)

우선 체크:

- `MAKER_AUTH_PROVIDER=supabase`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. 게임/세션 저장 실패

확인 파일:

- [persistence config](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/persistence-config.ts)
- [game repository](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/game-repository.ts)
- [session repository](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/session-repository.ts)

우선 체크:

- `APP_PERSISTENCE_PROVIDER=supabase`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. 이미지가 안 뜸

확인 파일:

- [asset storage boundary](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/game-asset-storage.ts)
- [asset upload route](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/api/games/[gameId]/assets/route.ts)
- [asset read route](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/api/games/[gameId]/assets/[...assetPath]/route.ts)

우선 체크:

- `SUPABASE_ASSETS_BUCKET=game-assets`
- bucket 존재 여부
- Storage object 존재 여부

필요하면 로컬에서 asset dry-run:

```bash
npm run migrate:local-assets:dry-run
```

현재 기준 결과:

- games with assets `3`
- asset files `15`
- total bytes `39154177`

## 내일 바로 이어서 할 추천 순서

1. `vercel link` 또는 dashboard import로 프로젝트 연결
2. env 입력
3. preview deploy
4. 메이커 로그인
5. 게임 저장
6. 이미지 업로드
7. 비회원 `/join` 참가
8. 문제 없으면 production 전략 결정

## 메모

- `npm run lint` 는 아직 비어 있다.
  - ESLint 초기 설정 prompt가 떠서 현재 검증 루틴에는 포함하지 않았다.
- 현재 핵심 검증 기준은 `build + runtime smoke test` 다.
- 오늘 기준으로 “배포 전에 막히는 구조적 문제”는
  - local JSON
  - local session
  - local asset
  - maker auth
  - 이 네 가지였고, 지금은 모두 Supabase 쪽으로 넘어가 있다.
