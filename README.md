# Murder Mystery Generator

머더미스터리 시나리오를 직접 제작하고, 오프라인 보드게임 세션을 진행하는 플랫폼.

> A platform for authoring murder mystery scenarios and running in-person board game sessions.

---

## 서비스 개요

| 모드 | 기기 | 기능 |
|------|------|------|
| **메이커** | PC/노트북 | 시나리오·캐릭터·단서 직접 작성·편집·저장 |
| **라이브러리** | PC/노트북 | 게임 목록 관리, 세션 시작 |
| **GM** | PC/노트북 | 게임 진행 제어, 카드 배포, 전체 상태 감시 |
| **플레이어** | 모바일 | 캐릭터 배경, 인벤토리, 카드 열람·건네주기 |

플레이어들이 **같은 공간에 모여** 각자 모바일로 접속, GM이 노트북에서 세션을 진행하는 오프라인 방식입니다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | Next.js 14+ (App Router) | SSR + API Routes 통합 |
| Language | TypeScript | 검증 라이브러리(Zod) 활용한 입력/저장 데이터 스키마 검증 |
| Styling | Tailwind CSS | 모바일 우선 |
| Storage | 로컬 JSON + SQLite | Phase 1 |
| 실시간 | SSE (Server-Sent Events) | 카드 배포·이전 알림 |
| 패키지 | npm | — |

---

## 폴더 구조

```
Murder-Mystery_Generator/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # 랜딩 페이지 (URL 없는 Route Group)
│   │   ├── library/                  # 게임 목록
│   │   │   └── _components/          # 이 라우트 전용 컴포넌트
│   │   ├── maker/                    # 게임 생성 위자드
│   │   │   ├── new/
│   │   │   └── [gameId]/edit/
│   │   ├── play/
│   │   │   └── [gameId]/
│   │   │       └── [charId]/         # 플레이어 개인 뷰
│   │   ├── join/[sessionCode]/       # 플레이어 입장
│   │   ├── rulebook/
│   │   └── api/
│   │       ├── games/                # 게임 CRUD
│   │       ├── sessions/[sessionId]/ # 세션 관리 + SSE (/events)
│   │       └── inventory/            # 인벤토리 조회 (SSE fallback)
│   │
│   ├── components/
│   │   ├── maker/                    # 메이커 UI (StepWizard, SettingsForm, ...)
│   │   ├── player/                   # 플레이어 UI (OpeningScreen, RoundView, ...)
│   │   ├── gm/                       # GM 대시보드 UI
│   │   └── ui/                       # 범용 프리미티브 (Button, Card, CardFlip, ...)
│   │
│   ├── lib/
│   │   ├── db/                       # SQLite 연결 + 스키마 + 마이그레이션
│   │   ├── storage/                  # 게임 패키지 파일 I/O
│   │   └── game/                     # 게임 상태 머신, 세션 관리
│   │
│   ├── types/                        # TypeScript 타입 (game/session/character/clue)
│   └── hooks/                        # React 커스텀 훅 (useSSE, useInventory, ...)
│
├── public/
│   ├── images/
│   │   ├── themes/                   # 테마별 배경 이미지 (gothic-mansion, city-noir, ...)
│   │   └── ui/                       # UI용 정적 이미지
│   ├── card-templates/               # 카드 배경 SVG/PNG 템플릿 (character/clue/event)
│   └── fonts/                        # 커스텀 웹폰트
│
├── data/                             # 런타임 생성 데이터 (gitignored)
│   ├── games/{game-id}/              # 게임 패키지 JSON + AI 생성 이미지
│   └── sessions/sessions.db          # SQLite (세션 상태)
│
├── design/                           # 디자인 소스
│   ├── tokens/tokens.json            # 색상·타이포 디자인 토큰
│   ├── card-layouts/                 # 카드 레이아웃 설계 파일
│   └── mockups/                      # Figma 익스포트, 화면 목업
│
├── docs/
│   ├── SPEC.md                       # 서비스 전체 명세
│   └── ADR/                          # Architecture Decision Records
│
├── ai_history/                       # 작업 보고서 (Claude 자동 생성)
├── CLAUDE.md
├── README.md
└── package.json
```

---

## 개발 단계

- **Phase 1** — 코어 루프: Next.js 세팅, 타입 정의, 시나리오 작성 코어 구현, 라이브러리 UI
- **Phase 2** — 메이커 완성: Step Wizard, 편집기, 카드 미리보기
- **Phase 3** — 플레이어 경험: 게임 상태 머신, SSE 실시간, 투표
- **Phase 4** — 퀄리티: PDF 출력, 테마 스킨, 공유

> 현재 상태: Phase 1 진입 전 (기획·명세 완료)

---

## 문서

- 상세 명세: [`docs/SPEC.md`](docs/SPEC.md)
- 작업 기록: [`ai_history/`](ai_history/)

## 라이선스

커스텀 제한 라이선스 — 수정·재배포·상업적 이용 금지. 자세한 조항은 [`LICENSE`](LICENSE) 참조.
