# 실시간 동기화 핫픽스 — Codex GPT-5

- **날짜**: 2026-03-12
- **모델**: Codex GPT-5
- **범위**: GM 타이머 상태 동기화, SSE keepalive 감지, 터널 URL 폴링 정리

---

## 1. 작업 배경

기존 구현에서 빌드 자체는 통과했지만, 실제 플레이 중 다음과 같은 런타임 불일치 위험이 확인되었다.

1. GM 페이즈 타이머가 서버의 `currentSubPhase`가 아니라 클라이언트 로컬 상태를 기준으로 동작
2. SSE dead connection 감지가 서버 keepalive를 실제로 보지 못해 유휴 상태에서 재연결 반복 가능
3. Cloudflare tunnel URL 획득 후에도 `/api/server-info` 폴링이 계속 돌아감

---

## 2. 수정 내용

### 2-1. GM 타이머 authoritative state 정렬

**문제**
- GM 헤더는 서버의 `sharedState.currentSubPhase`를 보는데, 타이머 컴포넌트는 로컬 `useState`를 사용
- 새로고침, PATCH 실패, 다른 탭에서 상태 변경 시 타이머 표시와 서버 상태가 어긋날 수 있었음

**조치**
- `PhaseTimer`가 `currentSubPhase`를 props로 받아 서버 상태를 단일 기준으로 사용
- sub-phase / phase 전환 PATCH 성공 시 응답의 `sharedState`를 즉시 반영
- 자동 넘김 시에도 서버 동기화 성공 후 다음 타이머가 이어지도록 재개 플래그 정리

**결과**
- GM 화면 재진입이나 상태 반영 지연 시 타이머 UI와 실제 세션 상태가 일치

### 2-2. SSE keepalive 감지 수정

**문제**
- 서버는 `: ping` 코멘트 프레임을 보내고 있었고, 클라이언트는 `"message"` 이벤트만 dead timer 리셋 대상으로 사용
- EventSource는 코멘트 프레임을 `message` 이벤트로 올리지 않으므로, 유휴 상태에서 15초마다 강제 재연결될 수 있었음

**조치**
- SSE 라우트에서 keepalive를 `event: ping` 이벤트로 전송
- `useSSE`에서 `ping` 이벤트를 dead timer 리셋 대상으로 추가

**결과**
- keepalive가 실제로 dead connection 감지 로직에 반영됨
- 프록시 대응용 keepalive와 클라이언트 재연결 기준이 일치

### 2-3. tunnel URL 폴링 중단 조건 수정

**문제**
- `SessionCode`의 interval 클로저가 초기 `tunnelUrl = null`을 계속 참조해서, URL 획득 후에도 폴링이 계속됨

**조치**
- `fetchServerInfo`를 `useCallback`으로 정리
- `tunnelUrl`이 없을 때만 interval을 생성하도록 effect dependency 수정

**결과**
- 외부 URL을 찾은 뒤 불필요한 `/api/server-info` 요청이 중단됨

---

## 3. 수정 파일

| 파일 | 작업 |
|---|---|
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | 타이머를 서버 sub-phase 기준으로 동기화, phase/sub-phase PATCH 응답 즉시 반영, tunnel URL 폴링 정리 |
| `src/hooks/useSSE.ts` | `ping` 이벤트 기반 dead timer 리셋 추가 |
| `src/app/api/sessions/[sessionId]/events/route.ts` | keepalive를 `event: ping` 이벤트로 전송 |

---

## 4. 검증

```bash
$ npx tsc --noEmit
# 출력 없음 (에러 0)

$ npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (10/10)
```

---

## 5. 후속 메모

- README와 ai_history 간 구현 상태 드리프트가 조금씩 생기고 있으므로, 큰 기능 단위로 문서 상태를 같이 정리하는 편이 안전함
- 다음 작업 후보:
  - GM 메인 보드용 공통/라운드별 정보 패널
  - 메이커의 미사용 GM 입력 필드 제거
  - 오프닝/엔딩/라운드 영상의 실제 GM 플레이 화면 반영
