# Phase 2 플레이 시스템 폴리싱 — 작업 보고서

- 날짜: 2026-03-08
- 소요 세션: 1회
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt

Phase 2 플레이 시스템 구현 완료 이후 실제 테스트에서 발견된 **16개의 버그 및 UX 개선 요청**:

1. 세션 나가기/재시작/삭제 버튼 없음
2. 장소에서 카드 획득 시 어떤 카드인지 미리 알 수 없어야 함 (블라인드)
3. 페이즈 제어 시 SSE 업데이트 안 돼서 새로고침 해야 하는 버그
4. 인벤토리 카드 상세 뷰 + 양도 기능 필요
5. 오프닝 페이즈에서 사건 개요/스토리/캐릭터 설정 볼 수 있어야 함
6. 엔딩에서 결과 분기 (범인 검거 성공/실패)
7. 서버 IP를 GM 화면에서 확인 가능하게
8. 라이브러리로 나가는 버튼 없음
9. 라운드당 획득 가능 단서 수 제한 + 동일 장소 재방문 제한
10. GM 화면에 범인 정보 노출 제거
11. 인벤토리 아이템 이중 추가 버그
12. 엔딩 화면 순서 개선 (나레이션 → 결과 배너)
13. 양도 후 장소에 아이템 재생성 버그
14. 장소 단서 플레이어 간 동기화 안 됨
15. GM 화면 페이즈별 진행 안내 필요
16. 캐릭터 개인 비밀 정보 토글 방식으로 변경

---

## 2. Thinking Process

### 2.1 SSE HMR 버그 원인 및 해결

**문제:** 페이즈 제어 시 SSE 업데이트가 도착하지 않아 새로고침 필요.

**원인:** Next.js dev 환경에서 HMR(Hot Module Replacement) 시 모듈 레벨 Map이 리셋되는 현상. broadcaster.ts의 `subscribers` Map이 메모리에서 초기화되어 연결된 구독자가 손실됨.

**해결:** `globalThis.__sse_registry` 패턴으로 싱글톤을 HMR 사이클에서 유지. 모듈 로드 시점이 아닌 런타임 globalThis에 저장하여 HMR 후에도 기존 구독자 레지스트리 보존.

### 2.2 인벤토리 이중 추가 Race Condition

**문제:** 플레이어가 단서 획득 후 인벤토리에 동일 카드가 2개 표시됨.

**원인:** `cards/route.ts`의 `acquireClue()` 함수에서:
1. 로컬 상태 업데이트: `setInventory([...prev, card])`
2. SSE broadcast: `inventory_{token}` 이벤트 발송 (전체 인벤토리 전송)

SSE가 네트워크 지연으로 로컬 업데이트 후 도착 시, 두 업데이트가 합쳐져 중복 추가. 특히 빠른 클릭 시 발생.

**해결:** 로컬 `setInventory` 제거, **SSE 단독으로만 처리**. 서버가 진실의 원천이므로 클라이언트는 수동 업데이트 금지, SSE 리스너만 신뢰.

### 2.3 장소 단서 동기화 버그

**문제:** 플레이어 A가 단서를 획득했는데 플레이어 B에게는 여전히 획득 가능하게 표시됨.

**원인:** 각 플레이어가 로컬에서만 "획득 완료" 상태를 관리. 다른 플레이어의 획득 정보가 SSE로 전달되지 않음.

**해결:** `SharedState`에 `acquiredClueIds: string[]` 필드 추가.
- 누군가 단서 획득 시 → 서버의 SharedState에 추가 → `session_update` 브로드캐스트에 포함
- 양도 시에도 `acquiredClueIds`에서 제거하지 않음 (한번 나간 카드는 영구 제거 상태 유지)
- 클라이언트: 다른 플레이어 보유 단서는 "다른 플레이어가 보유 중" 텍스트로 표시, 획득 버튼 비활성화

### 2.4 엔딩 분기 데이터 모델

**문제:** 범인 검거 성공/실패에 따라 다른 나레이션을 보여줘야 함.

**설계:** `Scripts` 타입에 `endingSuccess?: ScriptSegment`, `endingFail?: ScriptSegment` 추가.
- 메이커 ScriptEditor에서 성공/실패 두 섹션으로 분리 편집
- 플레이어 뷰에서 `voteReveal.majorityCorrect`에 따라 분기 나레이션 표시

### 2.5 라운드별 단서 획득 제한 및 재방문 차단

**설계:**
- `GameRules`에 `cluesPerRound: number` (기본 3개), `allowLocationRevisit: boolean` (기본 false) 추가
- `PlayerState`에 `roundAcquired: number` (현재 라운드 획득 수), `roundVisitedLocations: string[]` (이미 방문한 장소 ID) 추가
- 라운드 시작 시 모든 플레이어의 `roundAcquired = 0`, `roundVisitedLocations = []` 리셋
- 카드 획득 POST 시:
  - `roundAcquired >= cluesPerRound` → 403 (한도 초과)
  - `allowLocationRevisit === false` && `locationId in roundVisitedLocations` → 403 (방문 완료)
  - 성공 시 `roundAcquired++`, `roundVisitedLocations` 추가
- 클라이언트: 버튼 비활성화 대신 "한도 초과"/"방문 완료" 상태 텍스트 표시

### 2.6 GM 화면 보안: 범인 정보 완전 제거

**설계:** GM 대시보드는 공유 화면(노트북)에서 표시되므로 범인ID, 비밀정보 등 민감 데이터 완전 제거.
- 메이커에서만 범인 확인 가능
- GM 화면: "사건 개요", "진행 현황", "플레이어 목록", "투표 결과" 만 표시

---

## 3. Execution Result

### 3.1 수정/생성된 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/types/session.ts` | `SharedState.acquiredClueIds: string[]` 추가, `PlayerState.roundAcquired: number`, `roundVisitedLocations: string[]` 추가 |
| `src/types/game.ts` | `GameRules.cluesPerRound: number`, `allowLocationRevisit: boolean` 추가, `Scripts.endingSuccess?: ScriptSegment`, `endingFail?: ScriptSegment` 추가 |
| `src/lib/sse/broadcaster.ts` | `globalThis.__sse_registry` HMR 싱글톤 패턴 적용 (HMR 사이클에서 구독자 레지스트리 유지) |
| `src/lib/storage/session-storage.ts` | 새 세션 생성 시 `acquiredClueIds: []` 초기화 |
| `src/app/api/sessions/[sessionId]/route.ts` | DELETE 핸들러 추가 (세션 삭제), PATCH에 `end_session` action 추가 (세션 종료) |
| `src/app/api/sessions/[sessionId]/events/route.ts` | 25초 keepalive ping 추가 (연결 유지) |
| `src/app/api/sessions/[sessionId]/join/route.ts` | 참가 시 `roundAcquired = 0`, `roundVisitedLocations = []` 초기화 |
| `src/app/api/sessions/[sessionId]/cards/route.ts` | 라운드 한도 체크, 재방문 체크 로직 추가, 획득 시 `acquiredClueIds` 업데이트, 양도 시 처리 개선 |
| `src/app/api/server-info/route.ts` | LAN IP 반환 API 신규 생성 (네트워크 인터페이스 조회) |
| `src/app/api/games/route.ts` | `buildDefaultRules`에 `cluesPerRound: 3`, `allowLocationRevisit: false` 추가 |
| `src/app/play/[gameId]/page.tsx` | 헤더에 "← 라이브러리" 네비게이션 추가, 세션 강제 종료/삭제 버튼 추가 |
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | 범인 정보 제거, LAN IP 표시, 세션 제어 버튼 (재시작/종료/삭제), PhaseGuide 패널 추가 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 블라인드 카드 획득 (카드 내용 모른 상태), 카드 상세 모달, 양도 UI, 오프닝 사건 개요/캐릭터 설정 표시, 장소 동기화 (acquiredClueIds 반영), 비밀 정보 토글, 엔딩 화면 재배치 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | 엔딩 성공/실패 분기 섹션 추가 (endingSuccess/endingFail 편집) |
| `src/app/maker/[gameId]/edit/_components/LocationEditor.tsx` | 단서 획득 규칙 설정 패널 상단 추가 (cluesPerRound, allowLocationRevisit) |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | LocationEditor에 rules 객체 전달 |
| `src/app/join/page.tsx` | 6자리 세션 코드 입력 페이지 신규 생성 |
| `src/app/join/[sessionCode]/page.tsx` | 캐릭터 선택 화면 개선 (이름+배경 한 줄만 표시, 승리조건 숨김, 민감 정보 제거) |

### 3.2 핵심 아키텍처 결정

#### SSE 단일 진실 원천
로컬 상태 업데이트 제거, 서버 브로드캐스트만 신뢰하도록 통일. 클라이언트는 SSE 리스너를 통한 수동 업데이트만 허용.

#### acquiredClueIds 불변성
양도 후에도 `acquiredClueIds`에서 제거하지 않아 위치 기반 중복 획득 완전 차단.

#### GM = 내비게이터
공유 화면에서 범인 정보, 캐릭터 비밀 등 완전 제거. 메이커(PC) 전용 정보로 분리.

#### 라운드 단위 제한
`roundAcquired`, `roundVisitedLocations` 통해 라운드별 한도 및 재방문 제어. 라운드 진행 시 자동 리셋.

### 3.3 주요 개선 사항 요약

| 항목 | Before | After |
|------|--------|-------|
| SSE 페이즈 업데이트 | 새로고침 필요 | 자동 반영 (HMR 안정화) |
| 카드 중복 추가 | 발생함 | SSE 단독 처리로 차단 |
| 장소 단서 표시 | 로컬만 반영 | 전체 동기화 (acquiredClueIds) |
| 카드 획득 | 무제한 | 라운드당 3개 한도 |
| 재방문 | 가능 | 차단 |
| GM 화면 | 범인 정보 노출 | 완전 제거 |
| 세션 제어 | 버튼 없음 | 종료/삭제/재시작 가능 |
| 엔딩 | 단일 나레이션 | 성공/실패 분기 |

### 3.4 검증 항목

- [x] HMR 사이클에서 SSE 연결 유지 (globalThis 싱글톤)
- [x] 카드 획득 시 SSE만으로 인벤토리 업데이트 (로컬 수동 업데이트 제거)
- [x] 다른 플레이어가 획득한 카드 "다른 플레이어 보유 중" 표시
- [x] 라운드 한도 초과 시 버튼 비활성화 + 텍스트 표시
- [x] 재방문 방지 체크 (roundVisitedLocations)
- [x] GM 대시보드에서 범인 정보 0 노출
- [x] /api/server-info에서 LAN IP 반환
- [x] 엔딩 화면에서 majorityCorrect에 따라 성공/실패 분기
- [x] 양도 후 장소에 카드 재생성 안 됨 (acquiredClueIds 검증)
- [x] 세션 DELETE, 페이즈 `end_session` 액션 동작

---

## 4. 다음 단계

- [ ] 투표 결과 화면 최종 UX 검수
- [ ] 메이커의 단서 획득 규칙 설정 UI 추가 검증
- [ ] 엔딩 분기 시나리오 메이커 테스트 (성공/실패 나레이션 편집)
- [ ] 모바일 플레이어 뷰 장시간 플레이 안정성 테스트
- [ ] 라이브러리 → 새 게임/기존 게임 선택 페이지 추가
