# GM 타이머 + 네트워크 디버깅 — Claude Sonnet 4.6

- **날짜**: 2026-03-12
- **모델**: Claude Sonnet 4.6
- **도구**: Next.js 14, TypeScript, Cloudflare Tunnel

---

## 1. 사용자 프롬프트 요약

1. GM 화면에 페이즈 타이머 구현 (메이커 설정 라운드별 시간 연동, 자동 넘김 옵션)
2. 기본 설정 밀담/카드주고받기 토글 버튼 버그 수정
3. 모바일 접속 불가 문제 → Cloudflare Tunnel 도입
4. SSE 실시간 반영 안 되는 문제 수정
5. `game.players` undefined 런타임 에러 수정
6. 플레이어 화면 sub-phase 고정 표시 문제 수정

---

## 2. 주요 작업 및 판단 이력

### 2-1. 토글 버튼 버그 수정
**문제**: 밀담/카드주고받기 토글 서클이 틀어져 보임
**원인**: `position: absolute` span에 `left-0` 누락 → `left: auto`로 배치 불안정
**조치**: `SettingsEditor.tsx`, `SettingsForm.tsx` 4곳에 `left-0` 추가
**결과**: 빌드 성공, 토글 정렬 수정

### 2-2. GM 페이즈 타이머 구현
**문제**: GM 화면에 라운드 내 sub-phase(조사/브리핑/토론) 타이머가 없음
**조치**:
- `GMDashboard.tsx`에 `PhaseTimer` 컴포넌트 신규 추가
- `game.rules.phases`에서 각 sub-phase 시간 읽어 countdown
- 자동 넘김 체크박스 — 마지막(토론) 이후 `advancePhase()` 서버 호출
- 수동 "다음 →" 버튼으로 언제든 직접 이동 가능
- `advanceLabel` 하드코딩 `n >= 4` → `game.rules.roundCount` 실제값 사용
- `session/route.ts`의 `cur >= 4` 하드코딩도 game 로드 후 실제 roundCount 사용

### 2-3. 모바일 접속 불가 → Cloudflare Tunnel 도입
**문제**: 모바일에서 `10.3.56.99:3000` 접속 안 됨
**원인 단계적 파악**:
1. `next dev` 기본값 `127.0.0.1`만 listen → `-H 0.0.0.0` 추가
2. 학교/공용 Wi-Fi AP 격리로 기기 간 통신 차단 → 핫스팟 시도
3. 핫스팟 제공 폰이 클라이언트(맥북)에 역방향 접속 불가 구조 확인

**최종 해결**: Cloudflare Tunnel 도입
- `scripts/tunnel.mjs` — cloudflared 실행 후 URL을 `.tunnel-url` 파일에 저장
- `package.json` — `dev:tunnel` 스크립트 추가 (concurrently로 next + tunnel 동시 실행)
- `server-info API` — `.tunnel-url` 파일 읽어 tunnelUrl 반환
- `SessionCode` 컴포넌트 — 터널 URL 표시 + URL 복사 버튼, LAN IP도 각각 복사 버튼
- 터널 URL 5초마다 폴링, 생기면 자동 표시

### 2-4. SSE 실시간 반영 문제
**문제**: 플레이어 액션/GM 라운드 진행이 새로고침 없이 반영 안 됨
**원인**: Cloudflare Tunnel이 SSE 스트림을 버퍼링

**1차 시도**: 초기 2kB 패딩 + ping 25s→5s 단축
**결과**: 여전히 불완전

**최종 해결**: 3초 폴링 fallback 추가 (SSE와 병행)
- `GMDashboard` — `GET /api/sessions/{id}` 3초마다 polling
- Player page — `GET /api/sessions/{id}?token=X` 3초마다 polling
- SSE는 유지 (즉시 반영 가능할 때 활용), 폴링은 fallback
- `useSSE` — 15초 dead connection 감지 → 자동 재연결

### 2-5. `game.players` undefined 런타임 에러
**문제**: `/play/{gameId}` 접속 시 `TypeError: undefined is not an object (evaluating 'game.players.length')`
**원인**: 플레이어 미등록 상태 게임 JSON에서 `players` 필드가 빈 배열 대신 undefined
**조치**: GMDashboard 3곳 `game.players` → `(game.players ?? [])` null-safe 처리

### 2-6. 플레이어 sub-phase 표시
**문제**: GM이 조사→브리핑→토론 넘겨도 플레이어는 "Round 1 조사"로 고정
**원인**: sub-phase가 GM 클라이언트에만 존재, 서버/플레이어에 미전달
**조치**:
- `SharedState`에 `currentSubPhase?: "investigation" | "briefing" | "discussion"` 추가
- `route.ts` — 라운드 시작 시 `investigation` 초기화, `set_subphase` 액션 추가
- `PhaseTimer.doAdvance()` — sub-phase 변경 시 `onSubPhaseChange` 콜백 → API 호출
- Player page `phaseLabel()` — `sharedState.currentSubPhase` 받아 동적 표시

---

## 3. 최종 결과

```bash
$ npx tsc --noEmit
# 출력 없음 (에러 0)

$ npm run build
# ✓ Build completed successfully
# /play/[gameId]  6.12 kB  102 kB
```

- `npm run dev:tunnel` 실행 → cloudflared URL 자동 감지 → GM 화면에 복사 버튼 표시
- 모바일 터널 URL 접속 확인
- 폴링으로 최대 3초 내 상태 동기화 보장

---

## 4. 생성/수정된 파일 목록

| 파일 | 작업 |
|---|---|
| `src/app/maker/[gameId]/edit/_components/SettingsEditor.tsx` | 토글 `left-0` 수정 (2곳) |
| `src/app/maker/new/_components/SettingsForm.tsx` | 토글 `left-0` 수정 (2곳) |
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | PhaseTimer 신규, 폴링 추가, null-safe, advanceSubPhase, sub-phase 헤더 표시 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 폴링 추가, phaseLabel sub-phase 반영 |
| `src/app/api/sessions/[sessionId]/route.ts` | set_subphase 액션, roundCount 실제값, currentSubPhase 초기화 |
| `src/app/api/sessions/[sessionId]/events/route.ts` | 2kB 초기 패딩, ping 5초 |
| `src/app/api/server-info/route.ts` | tunnelUrl 반환 추가 |
| `src/hooks/useSSE.ts` | dead connection 15s 감지 후 재연결 |
| `src/types/session.ts` | `SharedState.currentSubPhase` 추가 |
| `scripts/tunnel.mjs` | **신규** — cloudflared 실행 + URL 파일 저장 |
| `package.json` | `dev:tunnel` 스크립트, concurrently devDep |
| `.gitignore` | `.tunnel-url` 제외 |

---

## 5. TODO / 다음 단계

- [ ] SSE 실시간 동작 재검증 (폴링이 fallback이지 주력이 되면 안 됨)
- [ ] GM 화면 sub-phase 변경 시 이벤트 로그에 "브리핑 시작" 등 기록
- [ ] 조건부 단서 실제 플레이 테스트 (has_items / character_has_item)
- [ ] 메이커 README 및 사용 가이드 업데이트 (`dev:tunnel` 사용법 포함)
- [ ] 엔딩 분기 (범인 검거 성공/실패) 구현
