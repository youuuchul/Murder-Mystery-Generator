# data/

런타임 생성 데이터 디렉토리 (gitignored).

## 구조

```
data/
├── games/
│   └── {game-id}/
│       ├── game.json        ← 전체 게임 패키지
│       ├── metadata.json    ← 목록 조회용 경량 파일
│       └── assets/
│           ├── covers/
│           ├── story/
│           ├── players/
│           ├── locations/
│           └── clues/
├── makers/
│   ├── index.json           ← 로컬 작업자 레지스트리
│   └── accounts.json        ← 로컬 계정 로그인 정보
└── sessions/
    └── {session-id}.json    ← 플레이 중 세션 상태
```

## 주의

- 이 디렉토리는 현재 로컬 개발/테스트용 런타임 데이터 저장소다.
- Git에는 포함되지 않는다.
- `makers/*.json` 도 로컬 로그인/작업자 식별용 런타임 데이터다.
- 지금 상태에서 배포 환경으로 전환해도 이 데이터가 자동으로 올라가거나 이어지지 않는다.
- 배포 전환 전에는 별도 백업과 마이그레이션이 필요하다.
