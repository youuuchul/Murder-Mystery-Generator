# Murder Mystery Generator

머더미스터리 시나리오를 직접 제작하고, 오프라인 보드게임 세션을 디지털로 진행하는 플랫폼.

> A platform for authoring murder mystery scenarios and running in-person board game sessions with digital card management.

---

## 서비스 개요

| 모드 | 기기 | 기능 |
|------|------|------|
| **메이커** | PC/노트북 | 시나리오·캐릭터·단서·스크립트 직접 작성·편집 |
| **라이브러리** | PC/노트북 | 게임 목록 관리, 세션 시작 |
| **GM** | PC/노트북 | 페이즈 제어·진행 안내, 세션 관리, 영상/음악 재생, 공통 화면 팝업 (지도 등) |
| **플레이어** | 모바일 | 캐릭터 카드, 인벤토리, 장소 탐색, 단서 획득·양도, 투표 |

플레이어들이 **같은 공간에 모여** 각자 모바일로 접속, GM이 노트북에서 세션을 진행하는 오프라인 방식입니다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| Framework | Next.js 14+ (App Router) | SSR + API Routes |
| Language | TypeScript + Zod | 입력 검증 |
| Styling | Tailwind CSS | 모바일 우선, 다크 테마 |
| Storage | 로컬 JSON 파일 | `data/games/`, `data/sessions/` |
| 실시간 | SSE (Server-Sent Events) | 페이즈·카드·투표 실시간 동기화 |
| AI | OpenAI Responses API (`gpt-5-mini`) | 메이커 제작 도우미 |
| 패키지 | npm | — |

---

## 현재 구현 상태

### ✅ 완료

#### 메이커 (시나리오 제작)
- 5단계 Step Wizard — **모든 탭 자유 클릭 이동** (편집 모드)
  - 스텝별 필수 누락 / 주의 항목 배지와 현재 단계 요약 힌트 표시
- 기본 설정: 제목·인원·난이도·태그·예상 시간·게임 규칙 **전체 편집 가능**
  - 플레이어 수 변경 시 캐릭터 수 불일치 경고 표시
- 사건 개요: 피해자 정보, 공개 사건 설명, 배경 장소, 대표 이미지/지도 URL
- 플레이어: 캐릭터 이름·배경·상세 스토리·비밀·관계·승점 조건·승리 조건
  - **행동 타임라인 시스템**: on/off, 시간대 슬롯 정의, 중앙 타임라인 편집 화면에서 캐릭터별 행동/알리바이 입력
  - **LLM 제작 도우미**: 메이커 편집 화면 우하단 드로어형 assistant
    - 현재 편집 중인 로컬 상태 기준으로 **모순 점검 / 단서 제안 / 다음 작업 추천**
    - 자유 질문 + 빠른 액션 버튼 지원
    - `gpt-5-mini` 기반, line-based structured parsing fallback으로 응답 복구
- 장소/단서: 장소별 단서 카드 배치, 라운드 잠금, 소유자 제한, GM 비밀 배포용 단서
  - **단서 획득 규칙**: 라운드당 최대 획득 수 설정 (0=무제한), 동일 장소 재방문 허용/불가
  - **장소 대표 이미지 업로드**: 제작 화면에서 파일 업로드 후 플레이어 장소 카드에 표시
  - **조건부 단서**: 조건 충족 시에만 획득 가능한 단서 설정
    - `has_items` — 내가 지정 단서를 현재 보유
    - `character_has_item` — 특정 캐릭터가 지정 단서를 현재 보유
    - 장소 자체에도 입장 조건 설정 가능 (미충족 시 장소 전체 잠금)
    - 반환 시 자동 조건 해제 (현재 인벤토리 기반 동적 체크)
  - **단서 카드 이미지 URL**: 메이커에서 단서별 이미지를 입력하고 미리보기 가능
- 스크립트: 대기실/오프닝/라운드별/투표/엔딩 나레이션, 페이즈별 GM 진행 가이드, 영상, 배경음악
  - **엔딩 성공·실패 분기 나레이션** 별도 작성
  - 라운드별 오픈 장소는 장소 설정 기준으로 자동 표시
  - 세그먼트/라운드별 작성 상태 배지, 빈 입력 예시, 엔딩 분기 상태 표시

#### 플레이 시스템
- 세션 생성/코드 참가 (`/join` → 6자리 코드 입력)
- GM 대시보드:
  - 페이즈 제어 (lobby → opening → round-1..N → vote → ending)
  - **메이커가 작성한 페이즈별 진행 가이드** + 나레이션 접기/펼치기
  - **미디어 중심 GM 보드** (영상 + 공통 이미지/지도 + 배경음악)
  - **현재 실행 포트 기준 LAN / Tunnel URL 표시** (같은 Wi-Fi 또는 외부 접속 주소)
  - 오프닝/엔딩에서는 공통 이미지·지도 패널 자동 숨김
  - 투표 현황 프로그레스 바 + 강제 공개
  - 세션 강제 종료 / 삭제
  - GM 비밀 단서 배포
- 플레이어 뷰 (모바일):
  - 캐릭터 카드 (배경 공개 + **상세 스토리 / 비밀 토글**로 접기)
  - **타임라인 탭**: 본인 캐릭터의 시간대별 행동/알리바이만 확인
  - 장소 탐색: **블라인드 획득** (제목 숨김, 획득 후 확인), 라운드 획득 한도 표시, 방문 완료 표시, **장소 대표 이미지 표시**
  - **장소 단서 동기화**: 다른 플레이어가 보유한 단서는 "다른 플레이어가 보유 중"으로 표시
  - 인벤토리: 카드 탭 → 상세 모달 (전체 내용 확인), **단서 이미지 카드형 표시**, **양도 기능** (대상 선택 → 확인 팝업)
  - 오프닝 페이즈: 오프닝 나레이션 + 사건 개요 + 피해자 정보 + 내 캐릭터 배경 표시
  - 투표: 자기 자신 제외, 실시간 진행 현황, 전원 투표 시 자동 결과 공개
  - 엔딩: 나레이션 → 진범 공개 → 득표 현황 → 승점 → **결과 배너 (맨 아래)**
  - **엔딩 분기**: 검거 성공/실패에 따라 다른 나레이션 표시
- SSE 실시간: 페이즈 변경·카드 획득·양도·투표 결과 즉시 반영
- HMR 안정성: `globalThis.__sse_registry` 패턴으로 dev 환경 재연결 없이 유지

---

## 폴더 구조 (실제 구현 기준)

```
Murder-Mystery_Generator/
├── src/
│   ├── app/
│   │   ├── library/                   # 게임 목록 (서버 컴포넌트)
│   │   ├── maker/
│   │   │   ├── new/                   # 새 게임 생성 (Step 1 설정)
│   │   │   └── [gameId]/edit/         # 게임 편집 (Step 1~5, 모든 탭 자유 이동)
│   │   ├── play/[gameId]/
│   │   │   ├── page.tsx               # GM 대시보드
│   │   │   ├── _components/GMDashboard.tsx
│   │   │   └── [charId]/page.tsx      # 플레이어 뷰 (모바일)
│   │   ├── join/
│   │   │   ├── page.tsx               # 코드 입력 페이지
│   │   │   └── [sessionCode]/page.tsx # 캐릭터 선택
│   │   └── api/
│   │       ├── games/[gameId]/        # 게임 CRUD
│   │       ├── maker-assistant/       # 메이커 제작 도우미 API
│   │       ├── server-info/           # LAN IP 반환
│   │       ├── join/[sessionCode]/    # 세션 조회 (민감정보 제거)
│   │       └── sessions/[sessionId]/
│   │           ├── route.ts           # GET/PATCH/DELETE
│   │           ├── events/route.ts    # SSE 스트림
│   │           ├── join/route.ts      # 플레이어 참가
│   │           ├── cards/route.ts     # 획득/배포/양도
│   │           └── vote/route.ts      # 투표/집계
│   ├── hooks/useSSE.ts                # Named event SSE 훅
│   ├── lib/
│   │   ├── ai/                        # OpenAI client, prompt, context, schema
│   │   ├── sse/broadcaster.ts         # SSE 구독자 레지스트리
│   │   └── storage/
│   │       ├── game-storage.ts        # JSON 게임 파일 I/O
│   │       └── session-storage.ts     # JSON 세션 파일 I/O
│   └── types/
│       ├── game.ts                    # GamePackage, Player, Clue, Scripts...
│       └── session.ts                 # GameSession, SharedState, PlayerState...
├── data/                              # 런타임 생성 (gitignored)
│   ├── games/{id}/game.json
│   └── sessions/{id}.json
├── ai_history/                        # 작업 보고서
└── docs/SPEC.md
```

---

## 시작하기

```bash
npm install
# OpenAI 연동이 필요하면 .env.example 참고 후 .env에 키 추가
npm run dev
# → http://localhost:3000
```

플레이어 접속: GM 화면의 세션 코드 확인 → 같은 Wi-Fi에서 GM 화면에 표시된 `http://[IP]:[현재 포트]/join` 주소로 접속

외부 네트워크나 모바일 테스트가 필요하면 Cloudflare Tunnel 포함 실행:

```bash
npm run dev:tunnel
# → Next dev 서버 + cloudflared 동시 실행
# → GM 화면에 외부 접속용 URL 자동 표시
```

- `npm run dev`: 같은 Wi-Fi/LAN 환경에서 테스트할 때 사용
- `npm run dev:tunnel`: 네트워크가 다르거나 공용 Wi-Fi 때문에 직접 접속이 막힐 때 사용

---

## Next Steps

### 이후 기능

~~- [ ] 조건부 단서 GM 수동 배포 지원 (`character_has_item` 잠금 해제 보조)~~
- [ ] RAG / LLM 기반 NPC 제작
- [ ] 카드 PDF 출력 (인쇄용)
- [ ] 게임 패키지 내보내기/가져오기 (JSON 공유)
- [ ] 모바일 PWA 지원 (홈 화면 추가)

---

## 문서

- 상세 명세: [`docs/SPEC.md`](docs/SPEC.md)
- LLM 제작 도우미 설계: [`docs/LLM_MAKER_ASSISTANT_PLAN.md`](docs/LLM_MAKER_ASSISTANT_PLAN.md)
- LLM 제작 도우미 코드 README: [`src/lib/ai/README.md`](src/lib/ai/README.md)
- 환경 변수 예시: [`.env.example`](.env.example)
- 작업 기록: [`ai_history/`](ai_history/)

## 라이선스

커스텀 제한 라이선스 — 수정·재배포·상업적 이용 금지. 자세한 조항은 [`LICENSE`](LICENSE) 참조.
