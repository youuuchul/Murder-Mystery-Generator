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
│           ├── characters/  ← AI 생성 캐릭터 이미지
│           └── cards/       ← 카드 렌더링 캐시
└── sessions/
    └── sessions.db          ← SQLite (게임 세션 상태)
```
