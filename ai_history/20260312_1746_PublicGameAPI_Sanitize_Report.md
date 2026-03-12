# 공개 게임 API sanitize 후속 핫픽스 — Codex GPT-5

- **날짜**: 2026-03-12
- **모델**: Codex GPT-5
- **범위**: `/api/games/[gameId]` 직접 접근 시 민감정보 노출 차단

---

## 1. 배경

플레이어 화면을 session API 기반 sanitize 데이터로 옮겼더라도,
`/api/games/[gameId]` GET이 전체 게임 JSON을 그대로 반환하면
URL 직접 호출만으로 범인 ID와 GM 전용 정보가 노출될 수 있었다.

---

## 2. 조치

- `src/app/api/games/[gameId]/route.ts`
  - GET 응답을 `buildPublicGame(game)` 기반으로 변경

---

## 3. 결과

- 공개 게임 조회 API는 이제 참가 페이지와 동일한 수준으로 민감정보가 제거된 payload만 반환
- 플레이어가 `gameId`를 알고 직접 API를 호출해도 GM 전용 데이터에 접근할 수 없음

---

## 4. 검증

```bash
$ npx tsc --noEmit
# 출력 없음 (에러 0)
```
