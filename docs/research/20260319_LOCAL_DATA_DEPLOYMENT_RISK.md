# 2026-03-19 로컬 데이터와 배포 전환 리스크 점검

## 결론

지금 버전으로 게임을 로컬에서 실제 제작한 뒤, 나중에 배포 환경으로 넘어가면
데이터가 “자동으로 이어지지 않는다”는 점을 전제로 봐야 한다.

더 중요한 건, 현재 구조를 거의 그대로 배포해서 그 배포본에서 직접 게임을 만들기 시작하면
데이터 유실 위험이 더 크다는 점이다.

따라서 현재 추천 순서는 아래다.

1. 로컬 버전으로 실제 유저 테스트
2. 로컬 데이터 백업 / 내보내기 기준 정리
3. Auth / DB / Storage 마이그레이션
4. 그 다음 배포 테스트

즉 지금 시점에서는 `배포 먼저 하고 테스트` 보다 `로컬 테스트 먼저` 가 더 안전하다.

## 현재 코드 기준 사실

### 1. 게임 데이터는 로컬 파일이다

- [game-storage.ts](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/storage/game-storage.ts) 는 `data/games/{id}/game.json`, `metadata.json` 에 직접 기록한다.
- [session-storage.ts](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/lib/storage/session-storage.ts) 는 `data/sessions/{sessionId}.json` 에 직접 기록한다.
- 메이커 작업자/계정 정보도 현재는 `data/makers/index.json`, `data/makers/accounts.json` 로컬 JSON 에 저장된다.
- 업로드된 이미지도 현재는 `data/games/{gameId}/assets/*` 아래 로컬 파일로 저장된다.

### 2. 이 데이터는 Git에 포함되지 않게 관리해야 한다

- [.gitignore](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/.gitignore) 에서 `data/games/*/`, `data/sessions/`, `data/makers/*.json` 를 무시한다.
- 즉 로컬에서 만든 게임/세션/업로드 자산과 메이커 로그인 정보는 배포 저장소에 자동으로 올라가지 않는다.

### 3. 현재 배포 타깃 스택은 아직 붙지 않았다

- 아직 Supabase DB/Storage로 옮기지 않았고
- 아직 배포 환경용 데이터 마이그레이션도 없다.

## 실제로 생길 수 있는 문제

### A. 로컬에서 만든 게임을 나중에 배포하면 자동으로 안 따라간다

이건 거의 확정이다.

이유:
- 데이터가 로컬 `data/` 에만 있고
- Git 추적 대상도 아니고
- 배포 시 이를 옮겨주는 스크립트도 아직 없다.

즉 지금 로컬에서 시나리오를 많이 만들어도, 나중에 배포 환경으로 옮기려면 별도 마이그레이션이 필요하다.

### B. 현재 코드 그대로 배포하고, 배포본에서 게임을 만들기 시작하면 더 위험하다

이 부분이 더 중요하다.

현재 저장 로직은 Node 파일 시스템 쓰기 전제다.
Vercel 공식 문서도 런타임 파일 저장이 필요할 때는 Blob 같은 object storage를 쓰는 방향을 안내한다.

근거:
- [How can I use files in Vercel Functions?](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)

이 문서와 현재 코드 구조를 같이 보면, 배포본에서 생성된 파일 기반 데이터는 장기 영속 저장소로 보기 어렵다.
즉 배포본에서 바로 운영용 게임 제작을 시작하는 건 아직 안전하지 않다.

### C. 로컬 테스트 중 데이터가 사라질 수도 있나

현재 로컬 환경에서는 파일이 로컬 디스크에 저장되므로,
사용자가 직접 `data/` 를 지우지 않는 한 즉시 사라질 가능성은 낮다.

다만 아래 경우는 주의가 필요하다.

- 다른 브랜치 작업 중 `data/` 정리
- 다른 브랜치 작업 중 `data/makers/` 정리
- 실수로 세션/게임 폴더 삭제
- 실수로 작업자/계정 JSON 삭제
- PC 교체/포맷
- 배포 전환 시 별도 백업 없이 “나중에 옮기면 되겠지” 하고 넘어감

즉 로컬에서의 위험은 “배포보다 낮지만, 자동 백업이 없다” 쪽이다.

## 현재 추천 운영 방침

### 1. 유저 테스트는 로컬 버전으로 먼저 진행

이유:
- 현재 기능 검증 목적에는 충분하다.
- 저장 구조가 가장 예측 가능하다.
- 배포 환경의 파일 영속성 문제를 피할 수 있다.

### 2. 테스트용 게임도 백업 대상으로 취급

최소 권장:
- `data/games/{gameId}` 폴더 단위 백업
- 업로드 자산 포함 백업

세션은 테스트용이면 버려도 되지만,
게임 패키지는 이후 마이그레이션 대상이 될 수 있으므로 보관이 필요하다.

### 3. 배포 전에는 반드시 마이그레이션 경로를 만든다

필수 전환 대상:
- 게임 JSON -> Supabase Postgres
- 세션 JSON -> Supabase Postgres
- 메이커 로컬 계정 JSON -> Supabase Auth / profiles
- 업로드 파일 -> Supabase Storage

## 판단

- 지금 당장 배포부터 해서 실제 제작/테스트를 옮기는 건 비추천
- 지금 버전으로 로컬 유저 테스트를 먼저 하는 건 괜찮음
- 다만 그 테스트 중 만든 게임 데이터는 `나중에 자동 승계된다`고 생각하면 안 됨

## 바로 필요한 후속 작업

1. 로컬 게임 데이터 백업 가이드
2. 게임 패키지 export/import
3. Supabase 스키마 초안
4. 로컬 JSON -> DB 마이그레이션 스크립트
