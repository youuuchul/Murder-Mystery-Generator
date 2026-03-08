# Phase 2 플레이 시스템 구현 — 작업 보고서

- 날짜: 2026-03-08
- 소요 세션: 1회
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt

Phase 2 플레이 시스템 구현 — SQLite 세션 시스템, GM 뷰, 플레이어 참가, SSE 실시간 알림

---

## 2. Thinking Process

**핵심 설계 결정:**

| 결정 | 이유 |
|------|------|
| JSON 파일 기반 세션 저장 | better-sqlite3 Node v25 빌드 실패 이력 → data/sessions/{id}.json으로 단순화 |
| 모듈 레벨 SSE broadcaster | Next.js 단일 Node.js 프로세스 특성 활용, 세션별 구독자 Set 관리 |
| token 기반 플레이어 인증 | localStorage에 mm_{sessionId} 키로 UUID 토큰 저장, API 요청 시 전달 |
| 단일 SSE 연결 | 세션 공개 상태 + 개인 인벤토리 이벤트를 named event로 구분, 연결 1개로 처리 |
| `/api/join/[sessionCode]` 분리 | 게임 데이터에서 민감 정보(범인ID, 비밀, GM메모) 제거 후 응답 |

**SSE 이벤트 설계:**
- `session_update` — 페이즈 변경, 플레이어 참가 등 공개 상태 변경
- `inventory_{token}` — 특정 플레이어의 인벤토리 업데이트 (token이 이벤트 이름에 포함되어 타인 수신 불가)

**페이즈 흐름:**
lobby → opening → round-1 → round-2 → round-3 → round-4 → vote → ending

---

## 3. Execution Result

### 생성된 파일

| 파일 | 역할 |
|------|------|
| `src/types/session.ts` | CharacterSlot.token 추가, playerId 네이밍 통일 |
| `src/lib/storage/session-storage.ts` | 세션 CRUD (JSON 파일 기반) |
| `src/lib/sse/broadcaster.ts` | 모듈 레벨 SSE 구독자 레지스트리 |
| `src/hooks/useSSE.ts` | named event SSE 훅, 3초 자동 재연결 |
| `src/app/api/sessions/route.ts` | POST 세션 생성, GET 목록 |
| `src/app/api/sessions/[sessionId]/route.ts` | GET 상태 조회(token 필터링), PATCH 페이즈 제어 |
| `src/app/api/sessions/[sessionId]/events/route.ts` | SSE 스트림 |
| `src/app/api/sessions/[sessionId]/join/route.ts` | 플레이어 참가 |
| `src/app/api/sessions/[sessionId]/cards/route.ts` | 단서 획득/GM 배포/카드 이전 |
| `src/app/api/join/[sessionCode]/route.ts` | 코드로 세션+게임 조회 (민감정보 제거) |
| `src/app/play/[gameId]/page.tsx` | GM 대시보드 서버 페이지 |
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | GM 대시보드 클라이언트 컴포넌트 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 플레이어 개인 뷰 (모바일 최적화) |
| `src/app/join/[sessionCode]/page.tsx` | 참가 페이지 (캐릭터 선택 + 이름 입력) |

### 검증 결과 (curl)

```
POST /api/games → 게임 생성 ✓
PUT /api/games/[id] → 플레이어 추가 ✓
POST /api/sessions → 세션 생성 (code: 2WNZ2E, slots: 3) ✓
POST /api/sessions/[id]/join → 참가 (token 발급) ✓
GET /api/join/2WNZ2E → 코드로 세션 조회 ✓
GET /api/sessions/[id]?token=xxx → 플레이어 상태 조회 (phase: lobby) ✓
PATCH /api/sessions/[id] {action:advance_phase} → 페이즈 전진 (lobby→opening) ✓
npm run build → 컴파일 오류 없음 ✓
```

### 카드 획득 로직

1. 플레이어가 장소 탭에서 단서 클릭 → POST /api/sessions/[id]/cards (action: "acquire")
2. 서버 체크: 조사 페이즈 여부, 장소 소유자 여부, 라운드 해제 여부, 비밀 단서 여부
3. 인벤토리 업데이트 → SSE broadcast (inventory_{token})
4. 플레이어 화면에 실시간 반영

## 4. 다음 단계

- [ ] Phase 3: 투표 시스템 (player→GM 범인 제출, GM 집계 화면)
- [ ] 카드 이전 UI (플레이어 간 카드 건네주기)
- [ ] 오프닝/라운드 스크립트 자동 재생 (GM 대시보드)
- [ ] 게임 결과 화면 (최종 점수, 승자 발표)
