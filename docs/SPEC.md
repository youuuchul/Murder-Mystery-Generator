# Murder Mystery Generator — 서비스 명세서

## 1. 서비스 개요

웹 기반 머더미스터리 보드게임 제작·플레이 플랫폼.

- **메이커**: 단계별 편집기로 시나리오를 직접 구성해 게임 패키지 생성
- **라이브러리**: 저장된 게임 목록 관리 (선택 → 플레이 / 편집 / 삭제)
- **플레이어**: 생성된 게임을 실제로 진행하는 인터랙티브 세션

---

## 2. 사용자 흐름

### 2-1. 게임 만들기 (메이커)

```
[기본 설정 입력]
  → 테마 (저택/도시/판타지 등)
  → 플레이어 수 (1~8명)
  → 난이도 (쉬움/보통/어려움)
  → 분위기 (진지/코믹/공포)

[콘텐츠 작성 단계 — 순서 중요]
  Step 1. 사건 개요 작성    (범죄 유형, 배경, 동기, 범인)
  Step 2. 인물 작성         (캐릭터별 배경·상세 스토리·비밀)
  Step 3. 단서 카드 작성    (물적 증거, 증언, 현장 단서)
  Step 4. 오프닝 스크립트  (사건 나레이션)
  Step 5. 라운드 이벤트    (각 라운드에서 공개될 단서/사건)
  Step 6. 엔딩 스크립트    (진실 공개 나레이션)

[사용자 검토]
  → 각 단계에서 내용 수정 가능
  → 미리보기: 카드 레이아웃 확인

[테스트 플레이]
  → 생성된 게임을 간단히 실행해보는 모드
  → 단서 흐름/난이도 검증

[저장]
  → 게임 패키지 JSON으로 저장
  → 라이브러리에 등록
```

### 2-2. 게임 선택 (라이브러리)

```
게임 카드 목록
  → 썸네일 / 제목 / 플레이어 수 / 소요시간 / 난이도
  → [플레이] [편집] [내보내기(PDF)] [삭제]
```

### 2-3. 게임 진행 (플레이어)

```
[로비]        GM이 게임 시작, 캐릭터 카드 배분
[오프닝]      나레이션 텍스트 + 선택적 배경음악/영상
[라운드 진행] 라운드별 단서 공개 → 플레이어 간 토론/추리
[투표]        범인 투표 (각자 비밀 선택)
[엔딩]        정답 공개 + 엔딩 나레이션
```

---

## 3. 데이터 모델 — 게임 패키지

게임 하나 = 하나의 JSON 파일 (`data/games/{game-id}/game.json`)

```ts
// types/game.ts

interface GamePackage {
  id: string;                   // UUID
  title: string;
  createdAt: string;            // ISO 8601
  updatedAt: string;

  settings: GameSettings;
  story: Story;
  characters: Character[];
  clues: Clue[];
  cards: CardSet;
  scripts: Scripts;
}

interface GameSettings {
  playerCount: number;          // 1~8
  difficulty: "easy" | "normal" | "hard";
  theme: string;                // "gothic-mansion" | "city-noir" | ...
  tone: "serious" | "comedy" | "horror";
  estimatedDuration: number;    // 분 단위
}

interface Story {
  incident: string;             // 사건 설명
  location: string;             // 배경
  timeline: TimelineEvent[];    // 사건 전 타임라인
  culpritCharacterId: string;   // 정답 (숨겨진 필드)
  motive: string;
  method: string;
}

interface Character {
  id: string;
  name: string;
  role: "victim" | "culprit" | "suspect" | "witness";
  background: string;
  story: string;                // 캐릭터 상세 스토리
  secret: string;               // 캐릭터만 아는 비밀
  relationships: Relationship[];
  cardImage?: string;           // 카드 이미지 URL
}

interface Clue {
  id: string;
  title: string;
  description: string;
  type: "physical" | "testimony" | "document" | "scene";
  revealAtRound: number;        // 몇 라운드에 공개
  pointsTo?: string;           // 어떤 캐릭터/사건과 연관
}

interface CardSet {
  characterCards: CharacterCard[];
  clueCards: ClueCard[];
  eventCards: EventCard[];      // 라운드별 이벤트
}

interface Scripts {
  opening: ScriptSegment;
  rounds: RoundScript[];
  ending: ScriptSegment;
}

interface ScriptSegment {
  narration: string;
  videoUrl?: string;            // 선택적 영상 연동
  backgroundMusic?: string;
}
```

---

## 4. 게임 저장 방식

### 로컬 파일 기반 (Phase 1)

```
data/
  games/
    {game-id}/
      game.json          ← 전체 게임 패키지
      metadata.json      ← 제목/설정/날짜 (목록 조회용 경량 파일)
      assets/
        characters/      ← 캐릭터 이미지 (선택)
        cards/           ← 카드 렌더링 캐시
```

- **목록 조회**: `metadata.json`만 읽어 빠른 로딩
- **게임 로드**: `game.json` 전체 읽기
- **수정**: 덮어쓰기

### Phase 2 확장 고려 (DB 기반)

SQLite 또는 Supabase로 전환 시:
- `games` 테이블: 메타데이터
- `game_packages` 테이블: JSON 컬럼으로 전체 패키지 저장

---

## 5. 앱 라우트 구조

```
/                            ← 랜딩 (라이브러리로 리다이렉트)
/library                     ← 게임 목록
/maker                       ← 메이커 랜딩
/maker/new                   ← 새 게임 만들기 (Step Wizard)
/maker/[game-id]/edit        ← 기존 게임 편집
/play/[game-id]              ← 게임 플레이 (GM 뷰)
/play/[game-id]/[char-id]    ← 개인 캐릭터 뷰
/rulebook                    ← 게임 규칙 열람
```

---

## 6. 폴더 구조

> Next.js 14+ App Router 기준. `src/` 루트 컨벤션 + Feature-first 컴포넌트 배치.

```
Murder-Mystery_Generator/
├── src/
│   ├── app/                                   ← Next.js App Router
│   │   ├── (marketing)/                       ← Route Group (URL 없음)
│   │   │   └── page.tsx                       ← 랜딩 (라이브러리 리다이렉트)
│   │   ├── library/
│   │   │   ├── page.tsx                       ← 게임 목록
│   │   │   └── _components/                   ← 이 라우트 전용 컴포넌트
│   │   │       ├── GameCard.tsx
│   │   │       └── GameGrid.tsx
│   │   ├── maker/
│   │   │   ├── page.tsx                       ← 메이커 홈
│   │   │   ├── new/
│   │   │   │   ├── page.tsx                   ← 새 게임 생성 위자드
│   │   │   │   └── _components/
│   │   │   └── [gameId]/edit/
│   │   │       └── page.tsx                   ← 기존 게임 편집
│   │   ├── play/
│   │   │   └── [gameId]/
│   │   │       ├── page.tsx                   ← GM 뷰
│   │   │       └── [charId]/
│   │   │           └── page.tsx               ← 플레이어 개인 뷰
│   │   ├── join/[sessionCode]/
│   │   │   └── page.tsx                       ← 플레이어 입장 (QR 링크)
│   │   ├── rulebook/
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── games/
│   │       │   ├── route.ts                   ← 게임 목록 GET / 생성 POST
│   │       │   └── [gameId]/route.ts          ← 게임 GET/PUT/DELETE
│   │       ├── sessions/
│   │       │   ├── route.ts                   ← 세션 생성 POST
│   │       │   └── [sessionId]/
│   │       │       ├── route.ts               ← 세션 상태 GET/PATCH
│   │       │       ├── events/route.ts        ← SSE 스트림
│   │       │       └── cards/route.ts         ← 카드 배포·이전
│   │       └── inventory/route.ts             ← 인벤토리 조회 (SSE fallback)
│   │
│   ├── components/
│   │   ├── maker/                             ← 메이커 전용
│   │   │   ├── StepWizard.tsx
│   │   │   ├── SettingsForm.tsx
│   │   │   ├── StoryEditor.tsx
│   │   │   ├── CharacterEditor.tsx
│   │   │   ├── ClueEditor.tsx
│   │   │   └── CardPreview.tsx
│   │   ├── player/                            ← 플레이어 전용
│   │   │   ├── OpeningScreen.tsx
│   │   │   ├── RoundView.tsx
│   │   │   ├── VotePanel.tsx
│   │   │   └── EndingScreen.tsx
│   │   ├── gm/                               ← GM 대시보드 전용
│   │   │   ├── GMDashboard.tsx
│   │   │   ├── CardDistributor.tsx
│   │   │   └── PlayerInventory.tsx
│   │   └── ui/                               ← 범용 프리미티브 (shadcn/ui 패턴)
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── CardFlip.tsx                  ← 카드 뒤집기 애니메이션
│   │       ├── CharacterCard.tsx
│   │       ├── ClueCard.tsx
│   │       └── Rulebook.tsx
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts                     ← SQLite 연결
│   │   │   ├── schema.ts                     ← 테이블 정의
│   │   │   └── migrations/
│   │   ├── storage/
│   │   │   └── game-storage.ts               ← 게임 패키지 파일 I/O
│   │   └── game/
│   │       ├── engine.ts                     ← 게임 상태 머신
│   │       └── session.ts                    ← 세션 관리
│   │
│   ├── types/
│   │   ├── game.ts                           ← GamePackage 전체 타입
│   │   ├── session.ts
│   │   ├── character.ts
│   │   └── clue.ts
│   │
│   └── hooks/                                ← React 클라이언트 커스텀 훅
│       ├── useSSE.ts
│       ├── useInventory.ts
│       └── useGamePhase.ts
│
├── public/
│   ├── images/
│   │   ├── themes/                           ← 테마별 배경 이미지
│   │   │   ├── gothic-mansion/
│   │   │   ├── city-noir/
│   │   │   └── fantasy/
│   │   └── ui/                               ← UI 정적 이미지
│   ├── card-templates/                       ← 카드 배경 SVG/PNG 템플릿
│   │   ├── character/
│   │   ├── clue/
│   │   └── event/
│   └── fonts/                                ← 커스텀 웹폰트
│
├── data/                                     ← 런타임 생성 데이터 (gitignored)
│   ├── games/{game-id}/
│   │   ├── game.json                         ← 전체 게임 패키지
│   │   ├── metadata.json                     ← 목록 조회용 경량 파일
│   │   └── assets/
│   │       ├── characters/                   ← 캐릭터 이미지 (외부 생성 포함)
│   │       └── cards/                        ← 카드 렌더링 캐시
│   └── sessions/

│       └── sessions.db                       ← SQLite
│
├── design/                                   ← 디자인 소스 파일
│   ├── tokens/
│   │   └── tokens.json                       ← 색상·타이포 디자인 토큰
│   ├── card-layouts/                         ← 카드 레이아웃 설계
│   └── mockups/                              ← Figma 익스포트, 화면 목업
│
├── docs/
│   ├── SPEC.md                               ← 이 문서
│   └── ADR/                                  ← Architecture Decision Records
│       └── 001-sse-vs-websocket.md
│
├── ai_history/                               ← 작업 보고서 (Claude 자동 생성)
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

### 폴더 설계 원칙

| 패턴 | 이유 |
|------|------|
| `src/` 루트 | Next.js 14+ 공식 권장, 앱 코드와 설정 파일 분리 |
| Feature-first 컴포넌트 | `maker/`, `player/`, `gm/` — 기능 단위로 그룹화, 도메인 응집도 향상 |
| Route-level `_components/` | App Router 패턴: 해당 라우트만 쓰는 컴포넌트를 라우트 옆에 배치 |
| `components/ui/` | 재사용 프리미티브. shadcn/ui 방식으로 직접 소유·수정 가능 |
| `lib/` 도메인 서브디렉토리 | `ai/`, `db/`, `storage/`, `game/` — 서버 전용 코드 격리 |
| `public/` vs `data/` | `public/`: 정적 에셋(URL 필요). `data/`: 런타임 생성(gitignored) |
| `design/` | Figma 익스포트, 디자인 토큰, 목업. 코드와 분리해 관리 |

---

## 7. 메이커 편집 흐름

### 작성 순서 (의존성 고려)

```
settings → story → characters → clues → cards → scripts
              ↑         ↑           ↑
           (필수)  (story 참조)  (chars 참조)
```

각 단계는 이전 단계 결과를 참조. 단계별 폼/에디터로 사용자가 직접 입력하며,
언제든 이전 단계로 돌아가 수정 가능.

### 저장 전략

- 각 단계 완료 시 임시 저장 (draft)
- 최종 저장 시 `game.json`으로 패키징
- Zod로 폼 입력값 검증 (필수 필드, 타입 체크)

---

## 8. 개발 단계

### Phase 1 — 코어 루프 검증
- [ ] Next.js 프로젝트 세팅
- [ ] 게임 패키지 타입 정의 (TypeScript)
- [ ] 기본 설정 폼 → 스토리 작성 → JSON 저장
- [ ] 라이브러리 목록 UI
- [ ] 기본 플레이어 뷰 (텍스트 기반)

### Phase 2 — 메이커 완성
- [ ] Step Wizard UI
- [ ] 인물/단서/스크립트 작성 & 편집기
- [ ] 카드 미리보기 컴포넌트
- [ ] 테스트 플레이 모드

### Phase 3 — 플레이어 경험
- [ ] 게임 단계 상태 머신
- [ ] 오프닝/엔딩 연출 (애니메이션/영상)
- [ ] 투표 시스템
- [ ] 캐릭터별 개인 뷰

### Phase 4 — 퀄리티 & 확장
- [ ] PDF 카드 출력
- [ ] 테마 스킨 적용
- [ ] 게임 공유/내보내기

---

## 9. 세션 & 카드 관리 아키텍처

### 9-0. 사용 시나리오 전제

> **오프라인 동일 공간 플레이**
> - 플레이어들이 한 테이블에 모여 있음
> - 각자 자기 모바일 폰으로 접속
> - 화면을 물리적으로 옆 사람에게 보여주며 소통
> - 서버는 **GM 노트북에서 로컬 실행** 또는 배포 서버 사용
> - 같은 WiFi 환경이므로 레이턴시 이슈 없음

```
[GM 노트북]          [플레이어1 모바일]  [플레이어2 모바일]  ...
  Next.js 서버   ←→    브라우저              브라우저
  게임 전체 상태       내 캐릭터 + 카드      내 캐릭터 + 카드
  카드 배포 권한       (다른 사람 카드 ❌)    (다른 사람 카드 ❌)
```

---

### 9-1. 상태 분리 모델

```
GameSession (서버 in-memory + SQLite 영속)
├── sharedState          ← 전원 열람 가능
│   ├── phase            (lobby / opening / round-N / vote / ending)
│   ├── currentRound
│   ├── publicClues[]    (라운드 공개 단서 — GM이 공개한 것)
│   ├── eventLog[]       "플레이어X가 [장소]에서 단서를 획득했습니다" 같은 공지
│   └── characterSlots[] { characterId, playerName, isLocked }
│
└── playerStates[]       ← 서버에만 존재, 본인 토큰으로만 접근
    └── PlayerState {
          playerId
          token           (UUID, localStorage 저장)
          characterId
          inventory[]     ← 이 플레이어만 볼 수 있는 카드 목록
          transferLog[]   (주고받은 이력)
        }
```

---

### 9-2. 접속 흐름

```
1. GM이 게임 시작 → 세션 생성 → QR코드/링크 표시
   예) http://192.168.0.10:3000/join/{session-code}

2. 플레이어가 링크 접속 → 닉네임 입력
   → 서버가 token 발급 → localStorage 저장
   → 캐릭터 선택 화면

3. 캐릭터 선택 (선착순 잠금)
   → 본인 캐릭터 배경 + 룰북 수신
   → 게임 대기

4. GM이 모든 플레이어 준비 확인 후 게임 시작
```

**캐릭터 중복 방지**: 선택 요청 시 서버가 잠금 확인 → 이미 선택된 경우 즉시 거절

| 정보 | 본인 | 다른 플레이어 | GM |
|------|------|--------------|-----|
| 캐릭터 이름 | ✅ | ✅ (선택 화면) | ✅ |
| 캐릭터 배경/비밀 | ✅ | ❌ | ✅ |
| 인벤토리 카드 목록 | ✅ | ❌ | ✅ |
| 이벤트 로그 (획득 사실) | ✅ | ✅ | ✅ |

---

### 9-3. 카드 배포 흐름

**GM이 배포 (기본)**
```
[GM 화면] 카드 선택 → 받을 플레이어 선택 → 배포
      ↓
[서버] 해당 playerState.inventory에 카드 추가
      ↓ SSE push
[해당 플레이어 모바일] "새 카드가 도착했습니다" 알림 + 인벤토리 갱신
[다른 플레이어] sharedState eventLog에 "GM이 [플레이어]에게 카드를 전달했습니다" (내용은 비공개)
```

**장소 탐색으로 획득 (선택 기능)**
```
[플레이어 화면] 장소 탭 → "탐색하기"
      ↓
[서버] 해당 장소의 미공개 카드 중 랜덤 or 순서대로 지급
      ↓ SSE push
[해당 플레이어] 카드 수신
```

---

### 9-4. 카드 소유권 이전 (건네주기)

오프라인에서 카드를 물리적으로 넘기는 행위를 디지털로 구현.

**플레이어 → 플레이어 이전**
```
[플레이어A 화면]
  인벤토리 → 카드 선택 → "건네주기" → 받을 플레이어 선택 → 전달

[서버]
  A.inventory에서 제거 → B.inventory에 추가
  transferLog에 기록 { from: A, to: B, cardId, timestamp }
  sharedState eventLog: "플레이어A가 플레이어B에게 카드를 전달했습니다"

[플레이어B 모바일] SSE로 즉시 알림 + 인벤토리 갱신
```

**GM 강제 이전 (분실·오배포 수정용)**
```
[GM 화면] 플레이어별 인벤토리 보기 → 카드 선택 → 소유자 변경
```

**이전 규칙**
- 이전 후 원소유자 카드 내용 열람 불가 (인벤토리에서 사라짐)
- GM은 transferLog 전체 열람 가능 (게임 진행 감사용)
- 이전은 취소 불가 (GM 강제 이전으로만 되돌리기 가능)

---

### 9-5. 인벤토리 조회 (언제든 가능)

```
[플레이어 화면] 하단 탭 "내 카드"
  → 획득 순서대로 카드 목록
  → 카드 탭 → 상세 내용 열람
  → (이전한 카드는 목록에서 제거, 이전 이력 탭에서 확인 가능)
```

---

### 9-6. 실시간 동기화 — SSE 채택

같은 WiFi 환경이므로 SSE(Server-Sent Events)로 충분.

```
[서버 → 클라이언트] SSE 스트림 (연결 유지)
  이벤트 유형:
  - session:update    sharedState 변경 (라운드 진행, 공개 단서)
  - card:received     내 인벤토리에 카드 추가됨
  - card:transferred  내 카드가 다른 플레이어에게 이전됨
  - phase:changed     게임 단계 전환

[클라이언트 → 서버] REST API
  - POST /session/join
  - POST /character/select
  - POST /card/transfer
  - GET  /inventory (fallback: SSE 끊겼을 때 폴링)
```

WebSocket 대비 SSE를 선택한 이유:
- 카드 배포/이전은 **서버 → 클라이언트 단방향 push**로 충분
- 클라이언트 → 서버 액션은 REST로 처리
- 구현이 단순하고 Next.js API Route에서 바로 지원

---

### 9-7. 스토리지

```
게임 패키지 (game.json)     ← 메이커에서 생성, 불변
게임 세션 (SQLite)          ← 플레이 중 실시간 상태
  sessions 테이블
  player_states 테이블
  card_inventory 테이블     { session_id, player_id, card_id, acquired_at }
  transfer_log 테이블       { from_player, to_player, card_id, timestamp }
```

세션 종료 후 SQLite 레코드는 보관 (게임 리플레이/이력용).

---

## 10. 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| Framework | Next.js 14+ (App Router) | SSR + API Routes 통합 |
| Language | TypeScript | 타입 안전성 (게임 패키지 구조 복잡) |
| Styling | Tailwind CSS | 빠른 UI 구성 |
| Storage | 로컬 JSON (Phase 1) | 빠른 프로토타이핑 |
| 검증 | Zod | 폼 입력 유효성 검사 |
| 패키지 | npm / bun | - |
