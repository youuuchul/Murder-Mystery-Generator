# Murder Mystery Generator

머더미스터리 시나리오를 직접 제작하고, 오프라인 세션을 디지털로 진행하는 웹 플랫폼입니다.

> Author a murder mystery scenario, start a session, and run the table with GM and player devices.

## 서비스 개요

| 모드 | 기기 | 핵심 역할 |
|------|------|-----------|
| 메이커 | PC/노트북 | 시나리오, 인물, 장소, 단서, 스크립트, 엔딩 제작 |
| 라이브러리 | PC/노트북 | 게임 목록 확인, 소개글 확인, 세션 시작 |
| GM | PC/노트북 | 페이즈 진행, 공통 미디어 재생, 세션 운영, 복구 대응 |
| 플레이어 | 모바일 | 캐릭터 정보, 장소 탐색, 인벤토리, 카드 양도, 투표 |

기본 사용 방식은 플레이어들이 같은 공간에 모여 각자 휴대폰으로 접속하고, GM이 노트북에서 세션을 진행하는 오프라인 플레이입니다.

## 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | Next.js 14+ App Router | 페이지 + API Routes |
| Language | TypeScript + Zod | 타입/입력 검증 |
| Styling | Tailwind CSS | 모바일 우선 |
| Storage | 로컬 JSON 파일 | `data/games`, `data/sessions` |
| Realtime | SSE | 페이즈, 단서, 투표 동기화 |
| AI | OpenAI Responses API (`gpt-5-mini`) | 메이커 제작도우미 |

## 현재 구현 상태

### 메이커

- 6단계 Step Wizard 편집기
  - Step 1 기본 설정
  - Step 2 사건 개요
  - Step 3 플레이어
  - Step 4 장소 & 단서
  - Step 5 스크립트
  - Step 6 엔딩
- 편집 모드에서는 모든 스텝을 자유롭게 이동할 수 있고, 이동 전 현재 내용을 먼저 저장합니다.
- 저장 진입점은 하단 액션바 하나로 통일되어 있고, `미저장 / 저장 중 / 저장 완료 / 저장 실패` 상태를 한 곳에서 보여줍니다.
- Step별 누락/주의 배지와 현재 단계 요약 힌트를 표시합니다.

### Step 1 기본 설정

- 제목, 소개글, 플레이어 수, 난이도, 태그, 예상 시간, 표지 이미지 설정
- 라이브러리 카드에 소개글을 그대로 노출
- 플레이어 수와 실제 캐릭터 수가 다르면 경고 표시
- 표지 이미지는 업로드 우선 UI로 입력

### Step 2 사건 개요

- 오프닝 스토리 텍스트, 범인 지정, 대표 지도, 피해자 정보, NPC 정보 작성
- 피해자/NPC/대표 지도 이미지 업로드
- 시간대 슬롯 기반 타임라인 on/off 및 슬롯 편집
- Step 3 플레이어 타임라인과 연결되는 공용 시간축 관리

### Step 3 플레이어

- 캐릭터 공개 배경, 상세 스토리, 비밀/반전, 관계, 승점 조건, 관련 단서 작성
- 캐릭터 대표 이미지 업로드
- 참가 선택 화면, 투표 카드, 플레이어 정보 화면에서 해당 이미지 재사용
- 타임라인 사용 시 슬롯별 행동/알리바이를 중앙 비교형 UI로 입력

### Step 4 장소 & 단서

- 장소 설명, 라운드 해금, 접근 제한, 입장 조건 설정
- 단서 카드 배치, 블라인드 획득, 현장 단서, 소유자 제한, 조건부 획득 설정
- 장소 이미지와 단서 이미지 업로드
- 라운드당 최대 획득 수, 같은 라운드 내 재방문 허용 여부 설정

### Step 5 스크립트

- 라운드별 이벤트 텍스트, GM 가이드, 투표 안내, 미디어 URL 설정
- 라운드에서 열리는 장소를 Step 4 설정 기준으로 자동 표시
- 라운드 이미지 override가 없으면 Step 2 대표 지도/이미지를 기본값으로 사용

### Step 6 엔딩

- 검거 대상 기준 분기 엔딩 작성
- 분기별 개인 엔딩 on/off
- GM 전용 정리 메모 작성

### 이미지 업로드

- 업로드된 파일은 `data/games/{gameId}/assets/*` 아래 로컬 파일로 저장됩니다.
- 현재 지원 scope
  - `covers`
  - `story`
  - `players`
  - `locations`
  - `clues`
- Git에는 포함되지 않도록 `data/games/*` 경로를 무시합니다.
- 기본 입력은 업로드 중심이고, 외부 URL 입력은 접어서 필요할 때만 펼칩니다.
- 업로드 전 브라우저에서 자동 리사이즈/압축을 수행합니다.
- 현재 파일 크기 제한은 15MB입니다.
- 자산 유형별 표시 비율
  - 표지: 가로형
  - 대표 지도: `contain` 중심
  - 인물: 세로형 portrait
  - 장소: 가로형 card
  - 단서: 문서/이미지 미리보기용 card

### AI 제작도우미

- 메이커 편집 화면 우하단 도킹 런처 + 드로어 UI
- 빠른 액션
  - 모순 점검
  - 단서 제안
  - 다음 작업 추천
- 채팅 응답 모드
  - `자동`
  - `가이드`
  - `문안`
- `문안` 모드는 붙여넣기용 초안을 `title / body / notes` 구조로 분리 렌더링
- 최근 대화 8턴을 프롬프트에 직접 포함해 후속 질문 맥락을 유지
- 스토리형 요청은 산문형, 설명형 요청은 UI 설명문형, GM 멘트는 진행 가이드형으로 문체를 나눠 유도

### 라이브러리 / 세션 / 플레이

- 라이브러리 카드에 표지, 소개글, 난이도, 태그, 예상 시간 표시
- 플레이어 수나 총 단서 수 같은 스포일러성 숫자는 카드에서 숨김
- 세션 시작 후 6자리 코드로 참가
- 같은 브라우저에서는 저장된 토큰으로 `/join/<code>` 재진입 시 자동 복귀
- 다른 브라우저/기기에서는 같은 캐릭터 + 같은 이름으로 `rejoin` 복구
- GM은 `재참가 허용`으로 접속자만 교체하고 캐릭터 진행 상태는 유지
- GM 대시보드
  - 페이즈 제어
  - 공통 미디어/지도 표시
  - LAN / Tunnel 접속 주소 안내
  - 진행 가이드 / 나레이션 표시
  - GM 비밀 단서 배포
  - 투표 진행 현황 및 강제 공개
- 플레이어 화면
  - `내 정보`, `장소 탐색`, `인벤토리`, `투표` 중심 모바일 UI
  - `내 정보` 순서: 이미지 → 배경 → 상세 스토리 → 비밀/반전 → 승점 조건 → 관련 단서
  - 상세 스토리, 비밀/반전, 승점 조건, 관련 단서는 펼치기/접기 지원
  - 본게임 라운드에 들어가면 탭이 자동으로 `장소 탐색`으로 이동
  - 투표 페이즈에 들어가면 탭이 자동으로 `투표`로 이동

## 폴더 구조

```text
Murder-Mystery_Generator/
├── src/
│   ├── app/
│   │   ├── (marketing)/                 # 홈/마케팅 라우트 자리
│   │   ├── library/                     # 게임 목록, 라이브러리 카드
│   │   ├── maker/
│   │   │   ├── new/                     # 새 게임 생성 (Step 1)
│   │   │   └── [gameId]/edit/           # 메이커 편집 (Step 1~6)
│   │   ├── join/                        # 코드 입력 / 캐릭터 선택 / 재접속
│   │   ├── play/[gameId]/               # GM 대시보드 / 플레이어 화면
│   │   ├── rulebook/                    # 규칙/가이드용 라우트 자리
│   │   └── api/
│   │       ├── games/[gameId]/          # 게임 CRUD / 자산 업로드
│   │       ├── join/[sessionCode]/      # 참가용 세션 조회
│   │       ├── maker-assistant/         # 제작도우미 API
│   │       ├── server-info/             # LAN 정보 반환
│   │       └── sessions/[sessionId]/    # 세션 관리, 참가, 재참가, 카드, 투표, SSE
│   ├── components/ui/                   # 공용 UI 컴포넌트
│   ├── lib/
│   │   ├── ai/                          # 프롬프트, 컨텍스트, 스키마, OpenAI client
│   │   ├── db/                          # 배포 전환용 DB 레이어 자리
│   │   ├── sse/                         # SSE broadcaster
│   │   └── storage/                     # 로컬 JSON 저장소 I/O
│   └── types/
│       ├── game.ts
│       ├── session.ts
│       └── assistant.ts
├── data/                                # 런타임 데이터 (gitignored)
│   ├── games/{id}/game.json
│   └── sessions/{id}.json
├── docs/
│   ├── backlog/                         # 구현 후보 / 정책 백로그
│   ├── plans/                           # 구현 계획 / 테스트 계획
│   ├── research/                        # 배포/리스크 검토
│   ├── handoff/                         # 작업 로그 / 인수인계
│   ├── SPEC.md
│   └── README.md
└── ai_history/                          # 작업 리포트 아카이브
```

## 시작하기

```bash
npm install
# OpenAI 연동이 필요하면 .env.example 참고 후 .env 설정
npm run dev
```

기본 접속:

- 라이브러리: `http://localhost:3000/library`
- 메이커: 라이브러리에서 새 게임 생성 또는 기존 게임 편집
- 플레이어 참가: GM 화면에 표시되는 `/join` 주소 + 6자리 코드 사용

외부 기기 테스트가 필요하면 터널 포함 실행:

```bash
npm run dev:tunnel
```

- `npm run dev`: 같은 Wi-Fi 또는 LAN 환경 테스트
- `npm run dev:tunnel`: 외부 네트워크, 공용 Wi-Fi, 원격 모바일 테스트

## 사용 흐름

1. `/library` 에서 새 게임을 만들거나 기존 게임을 연다.
2. Step 1~6에서 시나리오를 작성하고 하단 액션바로 저장한다.
3. 라이브러리에서 세션을 시작하고 GM 화면으로 들어간다.
4. 플레이어는 `/join` 에 접속해 코드 입력 후 캐릭터를 선택한다.
5. GM은 페이즈를 진행하고, 플레이어는 모바일에서 탐색/인벤토리/투표를 수행한다.
6. 접속 문제가 생기면 자동 복귀, 이름 기반 복귀, GM `재참가 허용` 순서로 복구한다.

## 제작도우미 사용법

1. 메이커 편집 화면 우하단 `제작 도우미` 버튼을 연다.
2. 빠른 액션으로 점검하거나 자유 질문을 입력한다.
3. `자동`은 질문에 따라 `가이드` 또는 `문안`을 서버가 추론한다.
4. `문안`은 입력칸에 붙여넣기 좋은 초안 카드로 응답한다.
5. 저장 전 로컬 변경도 같이 읽기 때문에, 아직 저장하지 않은 내용 기준으로도 질문할 수 있다.

## 다음 작업

- 제작도우미 `문안` 결과를 입력칸으로 바로 복사/적용하는 UX
- Step별 초안 프리셋과 문체 튜닝 고도화
- 라운드 대표 이미지 업로드와 미디어 편집 UX 정리
- 공개 라이브러리와 메이커 편집 권한 분리
  - 플레이는 공개 라이브러리
  - 편집은 자기 게임만
- 홈/라이브러리 진입 시 `게임 만들기 / 게임 플레이` 사용 가이드 분리
- `재참가 허용` 이후 기존 접속자에게 권한 교체 안내 표시
- 게임 패키지 내보내기/가져오기와 인쇄용 PDF 출력
- 장기적으로 `RAG + LLM` 기반 NPC 제작 확장

## 문서

- 문서 인덱스: [`docs/README.md`](docs/README.md)
- 상세 명세: [`docs/SPEC.md`](docs/SPEC.md)
- 배포 검토: [`docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md`](docs/research/20260319_VERCEL_SUPABASE_DEPLOYMENT_REVIEW.md)
- 로컬 데이터/배포 리스크: [`docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md`](docs/research/20260319_LOCAL_DATA_DEPLOYMENT_RISK.md)
- AI 제작도우미 설계 초안: [`docs/plans/LLM_MAKER_ASSISTANT_PLAN.md`](docs/plans/LLM_MAKER_ASSISTANT_PLAN.md)
- 라이브러리/메이커 접근 분리 백로그: [`docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md`](docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- 라이브러리/메이커 접근 분리 계획: [`docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md`](docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md)
- 로컬 제작자 유저 테스트 계획: [`docs/plans/20260319_LOCAL_CREATOR_USER_TEST_PLAN.md`](docs/plans/20260319_LOCAL_CREATOR_USER_TEST_PLAN.md)
- 홈 진입 가이드 백로그: [`docs/backlog/20260319_HOME_ENTRY_GUIDE_BACKLOG.md`](docs/backlog/20260319_HOME_ENTRY_GUIDE_BACKLOG.md)
- AI 레이어 구현 메모: [`src/lib/ai/README.md`](src/lib/ai/README.md)
- 환경 변수 예시: [`.env.example`](.env.example)

## 라이선스

커스텀 제한 라이선스. 자세한 내용은 [`LICENSE`](LICENSE)를 참고하세요.
