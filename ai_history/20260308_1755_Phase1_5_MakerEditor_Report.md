# Phase 1.5 — 메이커 Step 2~5 에디터 구현 — 작업 보고서

- 날짜: 2026-03-08
- 소요 세션: 1회
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt

"트러블슈팅 history 기록 후 다음 작업 넘어가"

Phase 1.5 — 메이커 Step 2~5 에디터 (사건 개요, 인물, 단서 카드, 스크립트) + 라이브러리 삭제 버튼 연동

## 2. Thinking Process

- `/maker/[gameId]/edit` 구조: 서버 컴포넌트(page.tsx)가 game.json 로드 → `MakerEditor` Client Component에 initialGame prop으로 전달
- `MakerEditor`: 전체 wizard 상태 + 자동저장 로직 중앙화. 각 에디터에 `game` slice만 전달해 불필요한 리렌더 최소화
- StepWizard 재사용: `/maker/new`의 StepWizard를 편집 페이지에서도 import
- `GameCard` Client Component 전환: 삭제 후 `router.refresh()`로 서버 컴포넌트 재실행, 목록 갱신
- `RoundScript` 초기화: scripts.rounds 배열이 비어도 `ensureRounds(count)`로 라운드 수만큼 빈 항목 보장

## 3. Execution Result

### 생성/수정된 파일 목록

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/app/maker/[gameId]/edit/page.tsx` | 생성 | 서버 컴포넌트, game.json 로드 + 404 처리 |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | 생성 | 클라이언트 wizard 상태 관리 + 저장 |
| `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx` | 생성 | Step 2: 사건 개요, 타임라인 편집 |
| `src/app/maker/[gameId]/edit/_components/CharacterEditor.tsx` | 생성 | Step 3: 인물 목록, 역할/배경/비밀/알리바이/관계 |
| `src/app/maker/[gameId]/edit/_components/ClueEditor.tsx` | 생성 | Step 4: 단서 카드, 라운드별 공개 시점 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | 생성 | Step 5: 오프닝/라운드/엔딩 나레이션 탭 |
| `src/app/library/_components/GameCard.tsx` | 수정 | "use client" 전환 + 삭제 버튼 + router.refresh() |

### 검증 결과

```
npm run build     → ✓ Compiled successfully (타입 오류 0)

Route 추가 확인:
/maker/[gameId]/edit   → HTTP 200 ✓
PUT /api/games/[id]    → 200 + updatedAt 갱신 ✓
DELETE /api/games/[id] → GameCard에서 fetch 후 router.refresh() ✓

엔드투엔드:
게임 생성(POST) → 편집 페이지 접근 → story PUT 업데이트 → updatedAt 갱신 확인 ✓
```

## 4. 다음 단계

- [ ] Phase 2: SQLite 세션 시스템 (`data/sessions/sessions.db`)
- [ ] `/play/[gameId]` GM 뷰 (세션 생성, QR 코드, 캐릭터 배분)
- [ ] `/join/[sessionCode]` 플레이어 입장 페이지
- [ ] SSE 실시간 이벤트 (`/api/sessions/[sessionId]/events`)
