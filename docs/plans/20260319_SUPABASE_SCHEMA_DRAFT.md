# 2026-03-19 Supabase 스키마 초안

## 목표

이 문서는 현재 로컬 JSON + 파일 저장 구조를
`Supabase Auth + Postgres + Storage` 로 옮기기 위한 1차 스키마 초안이다.

이번 초안의 범위:

- `users`
- `games`
- `sessions`
- `assets`
- `LLM context assembly`

핵심 전제:

- 플레이는 공개 라이브러리 기반
- 편집은 자기 게임만
- 메이커와 LLM은 현재 `GamePackage` 중심 구조를 크게 깨지 않는 방향으로 옮긴다.

## 설계 원칙

### 1. 메이커 편집 구조를 한 번에 과도하게 정규화하지 않는다

현재 메이커는 사실상 `GamePackage` 전체를 한 번에 읽고 쓰는 구조다.
이를 테이블 단위로 잘게 쪼개면:

- 저장 로직이 크게 복잡해지고
- LLM 컨텍스트 조립 비용이 늘고
- 마이그레이션 난이도가 급격히 올라간다.

그래서 1차는 `메타데이터 컬럼 + content_json(JSONB)` 하이브리드가 적절하다.

### 2. 라이브러리 조회와 편집 원본을 분리한다

- 라이브러리 카드 조회에는 요약 메타가 필요
- 메이커 편집과 LLM에는 전체 시나리오 원본이 필요

따라서 `games` 메타 테이블과 `game_content` 원본 JSON 테이블을 분리한다.

### 3. 세션은 권한/토큰 단위 데이터를 분리한다

세션은 게임 원본보다 변경 빈도가 높고,
토큰 기준의 개인 상태와 공용 상태가 섞여 있다.

따라서 세션은 `sessions + session_slots + session_player_states + session_votes` 형태로 나누는 편이 낫다.

### 4. 자산은 Storage + 메타 테이블로 관리한다

- 실제 파일: Supabase Storage
- 메타데이터/소유권/용도: Postgres `assets`

## Supabase 구성안

- Auth: Supabase Auth
- DB: Supabase Postgres
- Storage bucket: `game-assets`
- Realtime:
  - 1차: 기존 SSE 유지 가능
  - 2차: 세션 상태는 Supabase Realtime 전환 검토

## 테이블 초안

## 1. `profiles`

Supabase `auth.users` 와 1:1로 연결되는 앱 프로필 테이블.

```sql
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null default 'creator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 필드 메모

- `id`: `auth.users.id`
- `display_name`: 라이브러리/소유자 표시용
- `role`: 지금은 `creator` 정도면 충분, 나중에 `admin` 확장 가능

## 2. `games`

라이브러리 조회와 소유권/공개 상태 판정을 위한 메타 테이블.

```sql
create table games (
  id uuid primary key,
  owner_id uuid not null references profiles (id) on delete restrict,
  title text not null,
  summary text,
  difficulty text not null,
  player_count int not null,
  estimated_duration int not null,
  cover_asset_id uuid,
  visibility text not null default 'private',
  lifecycle_status text not null default 'draft',
  tags text[] not null default '{}',
  clue_count int not null default 0,
  location_count int not null default 0,
  round_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_editor_id uuid references profiles (id) on delete set null
);
```

### 추천 enum 후보

- `visibility`
  - `private`
  - `public`
- `lifecycle_status`
  - `draft`
  - `ready`
  - `archived`

### 왜 메타를 중복 저장하나

현재 `GamePackage` 안에도 같은 정보가 있다.
그래도 메타 컬럼을 따로 두는 이유:

- 공개 라이브러리 목록 조회가 빠르다
- RLS 조건을 단순하게 걸 수 있다
- 카드 렌더/검색/정렬이 편하다

## 3. `game_content`

메이커 편집의 실제 원본을 저장하는 JSONB 테이블.

```sql
create table game_content (
  game_id uuid primary key references games (id) on delete cascade,
  content_json jsonb not null,
  schema_version int not null default 1,
  migrated_from_local boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 핵심 아이디어

- `content_json` 은 현재 `GamePackage` 와 최대한 동일한 형태를 유지한다.
- 서버에서는 이 JSON을 읽어 기존 `normalizeGame()` 과 `buildMakerAssistantContext()` 흐름을 거의 그대로 재사용한다.
- `games` 메타 컬럼은 저장 시점에 `content_json` 에서 계산해 같이 갱신한다.

즉:

- 메이커 원본 = `game_content.content_json`
- 라이브러리 조회/권한 = `games`

## 4. `assets`

Supabase Storage 객체 메타와 게임 연결 정보.

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete restrict,
  game_id uuid not null references games (id) on delete cascade,
  bucket text not null default 'game-assets',
  object_path text not null,
  scope text not null,
  mime_type text,
  size_bytes bigint,
  width int,
  height int,
  source_type text not null default 'upload',
  external_url text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### `scope` 후보

- `cover`
- `story`
- `player`
- `location`
- `clue`
- `round`

### Storage 경로 예시

```text
game-assets/games/{game_id}/{scope}/{asset_id}.{ext}
```

### 설계 포인트

- 외부 URL도 같은 테이블에서 관리할 수 있게 `source_type`, `external_url` 을 둔다.
- JSON 안에는 최종적으로 `publicUrl` 또는 앱 내부 asset reference 둘 중 하나를 넣을 수 있다.
- 장기적으로는 `content_json` 에 직접 URL 대신 `asset_id` 를 넣는 전환도 가능하지만, 1차는 URL 유지가 더 쉽다.

## 5. `sessions`

세션 공용 상태 메타 테이블.

```sql
create table sessions (
  id uuid primary key,
  game_id uuid not null references games (id) on delete cascade,
  session_code text not null unique,
  host_user_id uuid references profiles (id) on delete set null,
  phase text not null,
  current_round int not null default 0,
  current_sub_phase text,
  public_clue_ids jsonb not null default '[]'::jsonb,
  acquired_clue_ids jsonb not null default '[]'::jsonb,
  event_log jsonb not null default '[]'::jsonb,
  vote_count int not null default 0,
  ending_stage text,
  vote_reveal jsonb,
  pending_arrest_options jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 왜 공용 상태를 JSONB로 두나

- `event_log`, `vote_reveal`, `public_clue_ids` 는 현재 구조와 잘 맞는다.
- 세션 상태는 수명이 짧고, 직렬화 형태가 이미 안정적이다.
- 1차에서는 빠르게 이행하는 것이 중요하다.

## 6. `session_slots`

현재 `sharedState.characterSlots` 의 분리 테이블.

```sql
create table session_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  player_id text not null,
  player_name text,
  token_hash text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);
```

### 설계 포인트

- 현재는 raw token 저장이지만 DB 전환 시에는 `token_hash` 로 가는 편이 낫다.
- 플레이어가 보내는 토큰을 서버에서 해시해 비교하면 된다.

## 7. `session_player_states`

현재 `playerStates[]` 의 분리 테이블.

```sql
create table session_player_states (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  token_hash text not null,
  inventory_json jsonb not null default '[]'::jsonb,
  transfer_log_json jsonb not null default '[]'::jsonb,
  round_acquired_json jsonb not null default '{}'::jsonb,
  round_visited_locations_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);
```

### 왜 여기서도 JSONB를 쓰나

- 인벤토리와 라운드 방문 상태는 현재 구조가 이미 객체/배열 중심이다.
- 카드 이전/복구 로직을 먼저 안전하게 옮기는 게 중요하므로, 1차는 JSONB 유지가 현실적이다.

## 8. `session_votes`

투표를 분리 저장하는 테이블.

```sql
create table session_votes (
  session_id uuid not null references sessions (id) on delete cascade,
  voter_token_hash text not null,
  target_player_id text not null,
  created_at timestamptz not null default now(),
  primary key (session_id, voter_token_hash)
);
```

### 이유

- 집계와 중복 투표 방지가 명확하다.
- 현재 `votes: Record<string, string>` 구조를 자연스럽게 치환한다.

## RLS 방향 초안

## `profiles`

- 본인만 수정 가능
- 공개 읽기 허용 여부는 최소화

## `games`

- `select`
  - `visibility = 'public'` 인 게임은 누구나 조회 가능
  - 소유자는 자기 게임 전체 조회 가능
- `insert/update/delete`
  - `owner_id = auth.uid()` 조건

## `game_content`

- 소유자만 읽기/쓰기
- 공개 라이브러리 API에서는 직접 노출하지 않음

## `assets`

- 소유자만 write
- 공개 게임의 공개 자산은 read 허용 가능
- 비공개 자산은 signed URL 또는 서버 프록시로 처리

## `sessions`

- 세션 플레이어 토큰 기반 접근과 Supabase Auth는 다른 축이다.
- 1차는 세션 관련 API는 서버에서 service role로 처리하고, 플레이어는 기존 토큰 모델을 유지하는 편이 현실적이다.

즉:

- 메이커/라이브러리 권한 = Auth + RLS
- 플레이어 세션 권한 = 기존 세션 토큰 + 서버 API

## LLM 컨텍스트 전략

## 문제

지금 제작도우미는 `GamePackage` 전체를 `normalizeGame()` 한 뒤,
`buildMakerAssistantContext()` 에서 축약 JSON을 만들어 LLM에 넘긴다.

DB로 옮긴 뒤 이를 완전히 테이블 조인 기반으로 새로 만들면:

- 프롬프트 조립 복잡도가 커지고
- 마이그레이션 중 assistant가 깨질 가능성이 높다.

## 추천 전략

### 1. `game_content.content_json` 을 assistant의 canonical source로 유지

- 메이커 저장 원본 = `content_json`
- assistant 요청 시 이 JSON을 읽어 기존 `normalizeGame()` 로 보정
- 이후 `buildMakerAssistantContext()` 는 최대한 그대로 재사용

이 방식이면:

- 기존 prompt/validation/assistant 코드를 덜 건드린다
- DB 전환 초기 리스크가 낮다

### 2. `games` 메타 컬럼은 목록/권한/필터용으로만 쓴다

assistant는 `games` 메타 몇 개만 참고하고,
실제 스토리/플레이어/단서 구조는 `content_json` 에서 읽는다.

### 3. 나중에 필요한 경우만 context cache를 추가

후속 후보:

- `game_assistant_cache`
- 또는 materialized summary view

하지만 1차에서는 불필요하다.

## 저장 흐름 초안

1. 메이커가 편집 내용을 저장
2. 서버가 `content_json` 을 `normalizeGame()` 통과
3. normalized 결과를 `game_content` 에 upsert
4. 같은 트랜잭션에서 `games` 메타 컬럼 갱신
5. assistant는 `game_content.content_json` 을 읽어 현재처럼 context 생성

## 마이그레이션 초안

### 1단계

- 기존 `data/games/{id}/game.json` 읽기
- `games`, `game_content` 삽입
- `metadata.json` 기반 메타가 아니라 `game.json` 기준으로 다시 메타 계산

### 2단계

- `data/games/{id}/assets/*` 를 Storage로 업로드
- `assets` 테이블 기록

### 3단계

- 세션은 기존 테스트 데이터라면 폐기 가능
- 운영 세션 이관이 필요하면 `sessions` 계열 테이블로 변환

## 추천 구현 순서

1. `profiles`
2. `games`
3. `game_content`
4. `assets`
5. 메이커 저장/조회 로직 전환
6. assistant 연결 확인
7. `sessions`

## 결론

현재 프로젝트에는 `완전 정규화` 보다 아래 구성이 맞다.

- `profiles`
- `games` 메타
- `game_content` 원본 JSONB
- `assets` 메타 + Storage
- `sessions` 하이브리드 구조

이 구조면:

- 라이브러리와 권한 분리가 가능하고
- 메이커 저장 마이그레이션이 현실적이며
- LLM 제작도우미도 현재 구조를 크게 깨지 않고 유지할 수 있다.
