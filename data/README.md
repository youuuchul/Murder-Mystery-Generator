# data/

로컬 개발용 런타임 데이터 디렉토리 (gitignored).

## 현재 상태

운영 데이터는 Supabase로 전환 완료. 이 폴더는 `APP_PERSISTENCE_PROVIDER=local`일 때만 사용된다.

| 저장 대상 | local 모드 | supabase 모드 |
|---|---|---|
| 게임 패키지 | `data/games/{id}/game.json` | `game_content.content_json` (jsonb) |
| 게임 메타 | `data/games/{id}/metadata.json` | `games` 테이블 (컬럼 분리) |
| 세션 | `data/sessions/{id}.json` | `sessions` 테이블 (`session_json` jsonb) |
| 메이커 계정 | `data/makers/*.json` | Supabase Auth + `profiles` |

## 로컬 구조 (local 모드)

```
data/
├── games/
│   └── {game-id}/
│       ├── game.json        ← 전체 게임 패키지
│       ├── metadata.json    ← 목록 조회용 경량 파일
│       └── assets/
├── makers/
│   ├── index.json           ← 로컬 작업자 레지스트리
│   └── accounts.json        ← 로컬 계정 로그인 정보
└── sessions/
    └── {session-id}.json    ← 플레이 중 세션 상태
```

## 주의

- Git에는 포함되지 않는다.
- `APP_PERSISTENCE_PROVIDER` 환경변수로 저장소를 전환한다 (`persistence-config.ts`).
- Supabase 모드에서는 `data/games/`, `data/makers/`가 사용되지 않는다.
