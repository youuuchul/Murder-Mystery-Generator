# 2026-03-30 라이브러리 / 메이커 접근 분리 현재 상태

## 목적

이 문서는 2026-03-30 기준으로 접근 분리 작업이 어디까지 구현됐는지와,
다음 구현 우선순위를 빠르게 확인하기 위한 상태 문서다.

## 구현 완료

### 1. 메이커 진입 보호

- `MAKER_ACCESS_PASSWORD` 기반 `메이커 전체 공통 비밀번호` 게이트를 계속 쓸 수 있다.
- 리다이렉트는 실제 요청 host/proto 기준으로 만들도록 정리돼 개발 환경에서도 안정적으로 동작한다.

### 2. 작업자 식별

- 임시 작업자 세션 쿠키가 있다.
- 로컬 계정 로그인 ID + 비밀번호 레이어가 추가됐다.
- 현재 작업자 세션에 계정을 연결하면 기존 `ownerId` 를 유지한 채 다른 브라우저와 다른 기기에서 같은 작업자로 다시 로그인할 수 있다.
- 계정을 아직 만들지 않은 경우에는 작업자 키(`userId`) 로 기존 ownerId 를 복구할 수 있다.

### 3. 게임 접근 메타

- `GamePackage.access`
  - `ownerId`
  - `visibility`
  - `publishedAt`
- 기존 로컬 게임 JSON도 정규화 시 access 메타 기본값을 채운다.

### 4. 서버 권한 강제

- 새 게임 생성: 작업자 세션 필수
- 게임 수정/삭제: 소유자만 허용
- 자산 업로드: 소유자만 허용
- 메이커 어시스턴트 호출: 작업자 세션 필수
- 세션 시작:
  - `public`: 누구나 가능
  - `private/draft`: 소유자만 가능

### 5. 라이브러리 / 관리 화면 분리

- `/library`
  - 공개 게임만 노출
  - 비로그인 접근 가능
- `/library/manage`
  - 작업자 세션 필수
  - 내 게임 / 귀속 가능 게임 중심 관리
  - `scope=all` 로 다른 작업자 게임도 읽기 전용 확인 가능

### 6. 공개 상태 전환

- `draft / private / public` 전환 API 가 있다.
- 공개 전 최소 체크리스트 검증이 서버에 있다.
- 관리 카드에서 공개 준비 상태와 누락 항목을 바로 볼 수 있다.

### 7. 소유권 귀속 / 이관

- `claimable` 레거시 게임은 관리 카드에서 현재 작업자로 바로 귀속할 수 있다.
- 현재 소유자는 다른 작업자의 로그인 ID 또는 작업자 키로 ownerId 를 직접 이관할 수 있다.

### 8. 인증 gateway 경계 정리

- route/page 계층은 이제 로컬 JSON 저장소를 직접 읽지 않고 `maker auth gateway` 를 통해 메이커 계정/작업자 정보를 가져온다.
- `MAKER_AUTH_PROVIDER`
  - `local`
  - `supabase`
  - 두 provider 선택 지점이 추가됐다.
- `@supabase/supabase-js` 와 Supabase adapter 뼈대가 추가됐다.
- `supabase` provider 에서는
  - `auth.users`
  - `profiles`
  - 기반 계정 로그인/생성을 gateway 뒤에서 처리할 수 있다.
- Supabase 계정 생성 시 기존 로컬 `ownerId` 는 새 auth user id 로 로컬 게임 JSON에서 자동 이관된다.
- `temporary` 작업자 로그인 탭은 `local` provider 에서만 허용된다.

### 9. Supabase SSR 세션 통합

- `@supabase/ssr` 기반 server-side auth helper 가 추가됐다.
- middleware 에서 Supabase session refresh 를 먼저 수행하고, 갱신된 auth cookie 를 후속 응답에도 복사한다.
- route/page 의 현재 작업자 판별은 이제
  - `local`: `mm_maker_user`
  - `supabase`: 검증된 Supabase Auth user + `profiles`
  - 기준으로 분기한다.
- `/api/maker-access`
  - 계정 로그인
  - 계정 생성
  - 로그아웃
  - 이 Supabase provider 에서는 실제 Supabase session cookie 를 발급/제거한다.
- 보호 API(`/api/games`, `/api/games/[gameId]`, `/api/sessions`, `/api/maker-assistant`)도 새 current-user resolver 를 사용한다.
- 메이커 접근 화면에서는
  - 실제 인증 상태는 Supabase 세션으로 판단하고
  - legacy `mm_maker_user` 쿠키는 recovery key 힌트용으로만 보조 사용한다.

### 10. 게임 / 세션 저장소 경계와 Supabase adapter

- route/page 계층이 `src/lib/storage/*` 구현을 직접 읽지 않도록
  - `src/lib/game-repository.ts`
  - `src/lib/session-repository.ts`
  - `src/lib/persistence-config.ts`
  - 경계를 추가했다.
- 현재 `APP_PERSISTENCE_PROVIDER`
  - `local`
  - `supabase`
  - 를 읽는다.
- `games`
  - `src/lib/supabase/persistence.ts`
  - `supabase/migrations/20260330_000002_create_games_and_game_content.sql`
  - 기준으로 실제 Supabase `games + game_content` adapter 가 추가됐다.
- `listGames / listPublicGames`
  - `games` 메타 테이블로 정렬/필터링하고
  - publish readiness 는 `game_content.content_json` 으로 다시 계산한다.
- `saveGame / deleteGame / getGame`
  - 는 `APP_PERSISTENCE_PROVIDER=supabase` 일 때 실제 Supabase DB를 사용한다.
- `sessions`
  - `src/lib/session-factory.ts`
  - `supabase/migrations/20260330_000003_create_sessions.sql`
  - 기준으로 실제 Supabase `sessions` adapter 가 추가됐다.
  - canonical source 는 `session_json` 이고
  - 목록/조인 조회용 메타 컬럼(`game_id`, `session_code`, `phase`, `locked_player_count` 등)을 함께 유지한다.

### 11. Supabase runtime 검증 상태

- `profiles`, `games`, `game_content`, `sessions` migration 이 모두 적용됐다.
- direct DB check
  - `public.sessions` 조회 성공
  - 현재 count `0` 확인
- `APP_PERSISTENCE_PROVIDER=supabase` 기준 smoke test
  - `account_signup`
  - `POST /api/games`
  - `PUT /api/games/[gameId]` 로 플레이어 2명 추가
  - `POST /api/sessions`
  - `GET /api/sessions?gameId=...`
  - `GET /api/join/[sessionCode]`
  - `POST /api/sessions/[sessionId]/join`
  - `GET /api/sessions/[sessionId]?token=...`
  - `DELETE /api/sessions/[sessionId]`
  - `DELETE /api/games/[gameId]`
  - 전부 정상 응답 확인
- smoke test 중 생성한 임시 Supabase user / game / session 은 검증 직후 정리했다.

### 12. 로컬 데이터 backup / import tooling

- `scripts/backup-local-data.mjs`
  - `data/games`, `data/sessions` 를 timestamp 백업으로 복사한다.
- `scripts/archive-orphan-sessions.mjs`
  - 참조 게임이 없는 orphan session 을 별도 backup 폴더로 이동한다.
- `scripts/migrate-local-data-to-supabase.mjs`
  - 기본은 dry-run 이고
  - `--apply` 가 있을 때만 실제 upsert 를 수행한다.
  - 실제 apply 직전에는 자동으로 로컬 백업을 한 번 더 만든다.
- package scripts
  - `npm run backup:local-data`
  - `npm run migrate:local-data:dry-run`
  - `npm run migrate:local-data -- --fallback-owner-id=<profile-id>`
- dry-run 결과
  - local games `6`
  - local sessions `22`
  - 즉시 import 가능한 games `4`
  - 즉시 import 가능한 sessions `13`
  - owner 없는 games `2`
  - owner 미해결 또는 orphan 때문에 skip 되는 sessions `9`
  - 기존 remote collision 은 현재 `0`

### 13. 로컬 데이터 import 결과

- fallback owner
  - `REDACTED_LOGIN`
  - `profiles.id = 5a96acfe-df44-473e-a519-c3329ea36fc8`
- actual import 결과
  - `games 6`
  - `game_content 6`
  - `sessions 21`
- owner 가 비어 있던 두 게임
  - `에덴의 조각들`
  - `마지막 페이지`
  - 는 모두 `REDACTED_LOGIN` 계정으로 귀속됐다.
- import 전 자동 backup
  - `/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/backups/local-data/20260330_200402-pre-supabase-import`
- orphan session archive
  - `1c00bdd5-1f63-4c85-a876-f38bdcf78c42`
  - 는 active `data/sessions` 에서 제거하고
  - `/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/backups/local-data/20260330_201500-orphan-sessions`
  - 로 이동했다.

### 14. 자산 저장소 경계와 Supabase Storage 이관

- `src/lib/game-asset-storage.ts`
  - 게임 asset 저장 backend를 `local / supabase` 로 분기한다.
  - game JSON 에는 계속 `/api/games/[gameId]/assets/...` 내부 URL만 기록한다.
- `src/app/api/games/[gameId]/assets/route.ts`
  - 업로드 시 provider 기준으로 local file 또는 Supabase Storage에 저장한다.
- `src/app/api/games/[gameId]/assets/[...assetPath]/route.ts`
  - asset 조회 시 provider 기준으로 local file 또는 Supabase Storage에서 읽는다.
  - Supabase 모드에서도 아직 이관되지 않은 local file이 있으면 dev 환경에서 local fallback을 허용한다.
- `src/lib/game-repository.ts`
  - Supabase game delete 성공 후 asset cleanup 을 best-effort 로 수행한다.
- `scripts/migrate-local-assets-to-supabase.mjs`
  - 기존 local asset 파일을 Supabase Storage로 복사한다.
  - 기본은 dry-run 이고 `--apply` 일 때만 실제 upload를 수행한다.
- `SUPABASE_ASSETS_BUCKET`
  - 미설정 시 기본 bucket 이름은 `game-assets` 다.

### 15. 로컬 asset migration 결과

- local asset dry-run
  - games with assets `3`
  - asset files `15`
  - total bytes `39154177`
- actual apply 결과
  - bucket `game-assets`
  - uploadedCount `15`
  - totalBytes `39154177`
- runtime smoke test
  - `APP_PERSISTENCE_PROVIDER=supabase`
  - `npm run start`
  - `/api/games/db277ab2-93b1-4984-be70-d1ea2579b5a0/assets/covers/1773908629069-4c718629-304d-4161-8f23-a6955e7072e4.webp`
  - `200`, `content-type=image/webp`, `cache-control=public, max-age=31536000, immutable` 확인

## 현재 한계

### 1. 로컬 -> Supabase 데이터 동기화는 일회성 import 상태다

- 기존 로컬 게임/세션은 Supabase 로 옮겼다.
- 기존 local asset 파일도 Supabase Storage로 1회 복사했다.
- 다만 이후 양쪽을 동시에 쓰는 동기화 경로는 없으므로,
  운영 기준으로는
  - `APP_PERSISTENCE_PROVIDER=supabase`
  - `MAKER_AUTH_PROVIDER=supabase`
  - 를 유지하고,
  로컬 JSON / local assets 는 backup/reference 용으로만 다루는 쪽이 맞다.

### 2. 대상 작업자 찾기 UX 가 약하다

- 이관 자체는 가능하지만, 대상 로그인 ID 또는 작업자 키를 사용자가 알고 있어야 한다.
- 이름 기반 검색이나 작업자 디렉토리 같은 보조 UX 는 아직 없다.

### 3. Vercel 프로젝트 연결과 preview 검증은 아직 안 했다

- `.vercel` 링크 파일은 아직 없다.
- Vercel env 동기화, preview deploy, 모바일/공개 세션 검증은 다음 단계다.

### 4. ESLint/lint 경로가 아직 비어 있다

- `npm run build` 는 통과한다.
- `npm run lint` 는 아직 ESLint 초기 설정이 없어 interactive setup 프롬프트에서 멈춘다.

## 다음 우선순위

1. Vercel project link + env 동기화
2. Preview deploy 후 maker / public library / join flow 실사용 점검
3. 대상 작업자 찾기 UX 보강
4. `profiles` 기반 협업자 모델 준비
5. ESLint 설정 추가 후 lint 를 실제 검증 루틴에 편입

## 참고 문서

- [접근 분리 백로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- [접근 분리 구현 계획](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md)
- [작업 로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/ai_history/20260330_0924_MakerUserSessionAndAccessMeta_Report.md)
