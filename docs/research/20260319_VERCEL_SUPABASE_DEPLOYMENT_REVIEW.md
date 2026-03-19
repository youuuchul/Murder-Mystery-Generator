# 2026-03-19 Vercel + Supabase 배포 검토

## 결론

이 프로젝트의 배포 스택으로 `Vercel + Supabase` 조합은 적합하다.
다만 지금 구조를 그대로 올리는 것은 맞지 않고, 아래 3가지는 먼저 전환해야 한다.

1. 로컬 JSON 저장소 -> Supabase Postgres
2. 로컬 업로드 파일 -> Supabase Storage
3. 메이커 무권한 접근 -> Supabase Auth + RLS 기반 권한 모델

즉, `호스팅은 Vercel`, `데이터/권한/파일은 Supabase` 로 역할을 분리하는 방향이 가장 자연스럽다.

## 왜 이 조합이 맞는가

### Vercel 장점

- Next.js App Router와 가장 자연스럽게 맞는다.
- 공식 문서 기준으로 Vercel은 Next.js SSR을 함수로 자동 구성하고, 사용하지 않을 때 scale to zero, 트래픽 증가 시 자동 확장을 제공한다.
- Next.js 스트리밍도 Route Handlers, Vercel Functions, React Server Components 기준으로 공식 지원한다.
- Preview 배포, 도메인 연결, 환경변수 관리, Git 연동이 배포 초기 운영에 유리하다.

근거:
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)

### Supabase 장점

- Next.js App Router 기준 공식 Auth quickstart가 있다.
- Postgres + Auth + Storage + Realtime를 한 프로젝트 안에서 같이 가져갈 수 있다.
- RLS를 Auth와 결합해 `내 게임만 편집`, `공개 게임만 조회` 같은 권한 모델을 DB 레벨에서 걸 수 있다.
- Storage도 RLS 정책과 같이 가져갈 수 있어서 이미지 업로드와 메이커 자산 보호에 유리하다.
- Realtime은 Postgres 변경 구독 기반이라 세션/투표/카드 상태를 장기적으로 SSE보다 일관되게 정리하기 좋다.

근거:
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage schema](https://supabase.com/docs/guides/storage/schema/design)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

## 이 프로젝트 기준 예상 장점

### 1. 배포 구조가 단순해진다

- 프론트/서버 앱: Vercel
- 데이터/권한/파일: Supabase

현재처럼 로컬 디스크와 로컬 세션 파일에 의존하지 않아도 된다.

### 2. 메이커 권한 분리가 쉬워진다

- `users`
- `games.owner_id`
- `games.visibility`

이 조합만 잡히면:
- 공개 라이브러리 조회
- 내 게임만 편집
- 비공개 게임 숨김

을 비교적 깔끔하게 구현할 수 있다.

### 3. 자산 업로드를 운영 가능한 구조로 옮길 수 있다

지금은 `data/games/{gameId}/assets/*` 아래 로컬 파일 저장인데, 배포 환경에서는 이 방식이 맞지 않는다.
Supabase Storage로 옮기면 메타데이터와 접근 정책을 같이 관리할 수 있다.

### 4. 세션/게임 데이터 동시 수정 안정성이 좋아진다

현재 JSON 파일 I/O 구조는 메이커 다중 접속이나 플랫폼 운영 시 충돌 위험이 있다.
Postgres로 옮기면 적어도 저장 단위, 소유권, 공개 상태, 세션 상태를 더 안전하게 관리할 수 있다.

## 예상 문제점

### 1. 현재 로컬 파일 저장 구조는 Vercel에 그대로 올릴 수 없다

Vercel 공식 문서도 파일 쓰기가 필요하면 Vercel Blob 같은 object storage를 쓰라고 안내한다.
즉 현재 `game-storage.ts`, `session-storage.ts`, 자산 업로드 API는 그대로 유지할 수 없다.

근거:
- [How can I use files in Vercel Functions?](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)

### 2. 세션 상태도 파일이 아니라 DB로 옮겨야 한다

지금 세션은 `data/sessions/{sessionId}.json` 기반이다.
배포 후 다중 요청, 다중 인스턴스, 운영 재시작을 생각하면 세션도 Postgres 테이블로 옮기는 게 맞다.

이건 공식 문서 인용이 아니라 현재 코드 구조 기준의 직접 판단이다.

### 3. 권한 설계가 생각보다 중요하다

Supabase는 RLS가 강력하지만, 정책을 잘못 짜면:
- 아무도 못 읽거나
- 너무 많이 읽거나
- service role 남용으로 서버 권한이 과해질 수 있다.

특히 이 프로젝트는:
- 공개 라이브러리
- 내 게임 편집
- 세션 시작 권한
- 플레이어용 민감정보 필터링

을 모두 분리해야 해서 정책 테이블 설계가 중요하다.

### 4. Realtime 전환 범위를 정해야 한다

현재는 SSE + 폴링 fallback 구조다.
Vercel은 Next.js 스트리밍을 지원하므로 당장 SSE를 완전히 못 쓰는 건 아니지만,
장기적으로 세션 동기화를 더 키울 생각이면 Supabase Realtime로 옮기는 편이 구조상 더 자연스럽다.

이 부분은 공식 문서와 현재 구조를 바탕으로 한 판단이다.

근거:
- [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)

### 5. 서버리스 DB 연결 방식 선택이 중요하다

Supabase 공식 문서 기준으로 서버리스나 짧은 작업은 Supavisor transaction mode를 권장한다.
Vercel 함수에서 직접 Postgres 연결을 많이 열면 연결 수 관리가 중요해진다.

근거:
- [Supabase connection strings](https://supabase.com/docs/reference/postgres/connection-strings)
- [Supabase connection management](https://supabase.com/docs/guides/database/connection-management)

## 이 프로젝트에 대한 추천 스택 배치

### 1차 추천

- Hosting: Vercel
- Auth: Supabase Auth
- Database: Supabase Postgres
- File storage: Supabase Storage
- Realtime:
  - 초기: 현재 SSE 유지 가능성 검토
  - 중기: Supabase Realtime 전환 검토

### 권장하지 않는 초기 분기

- Vercel + Supabase + Vercel Blob 동시 도입

이유:
- 파일 저장 위치가 둘로 갈라진다.
- 권한 정책도 Supabase Auth/RLS와 Blob 접근을 따로 맞춰야 한다.
- 지금 단계에선 복잡도만 늘고 이점이 작다.

## 현재 코드 기준 마이그레이션 포인트

### 바꿔야 하는 영역

- `src/lib/storage/game-storage.ts`
- `src/lib/storage/session-storage.ts`
- `src/app/api/games/[gameId]/assets/route.ts`
- `src/app/api/games/[gameId]/assets/[...assetPath]/route.ts`
- 공개 라이브러리 / 내 게임 / 메이커 권한 체크 전체

### 새로 필요해지는 영역

- auth helper
- current user resolver
- ownership / visibility schema
- Supabase client 분리
  - browser client
  - server client
  - admin/service client

## 추천 진행 순서

1. 규칙 문서에 `Vercel + Supabase` 를 목표 스택으로 고정
2. 메이커 접근 정책 확정
3. Supabase Auth 도입
4. `games`, `sessions`, `assets` 데이터 모델 설계
5. JSON/file storage -> Supabase 마이그레이션
6. 배포 환경변수와 Vercel 프로젝트 연결

## 메모

- 이 문서 기준 판단으로는 `Vercel + Supabase` 조합 자체는 맞다.
- 문제는 스택 선택보다 현재 로컬 저장 구조를 얼마나 빨리 걷어내느냐다.
- 따라서 다음 구현 우선순위는 “배포 버튼 누르기”가 아니라 “Auth/DB/Storage 마이그레이션 설계”다.
