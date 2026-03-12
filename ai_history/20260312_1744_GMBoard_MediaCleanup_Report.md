# GM 보드 + 미디어 반영 + 입력 정리 — Codex GPT-5

- **날짜**: 2026-03-12
- **모델**: Codex GPT-5
- **범위**: GM 메인 보드 추가, 미사용 GM 입력 제거, 페이즈 영상 반영, 플레이어용 데이터 sanitize

---

## 1. 사용자 요청 요약

1. GM 메인 화면에 라운드별/공통 정보를 띄워둘 수 있는 "게임 판" 성격의 보드 추가
2. 초기에 잘못 설계된 TRPG식 GM 입력 칸 제거
3. 오프닝/엔딩 영상이 실제 GM 플레이 화면에서 재생되도록 반영

---

## 2. 구현 내용

### 2-1. GM 메인 보드 추가

**조치**
- `GMDashboard.tsx`에 `GMBoard` 영역 추가
- 공통 정보:
  - 배경 장소
  - 공개 사건 설명
  - GM 공통 메모
  - 사건 전 타임라인
  - 공통 지도/참고 이미지
- 라운드/페이즈 정보:
  - 오프닝/라운드/엔딩별 나레이션 블록
  - 페이즈별 GM 메모
  - 페이즈별 영상
  - 배경 음악 링크
- 장소 현황:
  - 장소별 총 단서 수 / 획득 수 / 남은 수 / 비밀 단서 수
  - 단서 칩 상태(획득/비밀/대기) 표시

**결과**
- GM 화면 오른쪽 상단이 실제 세션 진행용 메인 보드 역할을 하도록 확장됨

### 2-2. 메이커 입력 구조 정리

**삭제/정리**
- 사용되지 않던 입력 칸:
  - 스토리 시놉시스
  - 범행 수법
  - 범행 동기

**대체 추가**
- `StoryEditor.tsx`
  - `GM 메인 화면 공통 메모`
  - `대표 지도 / 참고 이미지 URL`
- `ScriptEditor.tsx`
  - 오프닝/엔딩 페이즈용 `GM 화면 메모`
  - 라운드별 `영상 URL`, `배경 음악 URL`, `GM 화면 메모`

**결과**
- 메이커 입력이 "TRPG GM 비밀 노트"가 아니라 실제 디지털 진행 화면용 데이터 중심으로 재정렬됨

### 2-3. 페이즈 영상 실제 반영

**조치**
- 기존 `ScriptSegment.videoUrl`만 저장되던 상태에서, GM 대시보드가 이를 실제로 렌더링하도록 구현
- YouTube / Vimeo embed, mp4/webm/ogg 직접 재생, 일반 외부 링크 fallback 지원
- `RoundScript`에도 `videoUrl`, `backgroundMusic`, `gmNote` 필드 추가
- 엔딩은 공통 엔딩 + 성공/실패 분기를 session 상태에 따라 선택 표시

**결과**
- 오프닝/엔딩 영상 URL이 더 이상 죽은 데이터가 아니라 실제 세션 진행 화면에서 사용됨
- 라운드별로도 GM이 원하는 미디어를 붙일 수 있게 됨

### 2-4. 플레이어용 게임 데이터 sanitize

**발견**
- 플레이어 화면이 `/api/games/[gameId]` 전체 게임 JSON을 직접 가져오고 있어,
  GM 전용 데이터가 늘어날수록 노출면도 같이 커지는 구조였음

**조치**
- `src/lib/game-sanitizer.ts` 신규 추가
- 참가 페이지: `buildPublicGame()`
- 플레이어 세션 조회: `buildGameForPlayer()`
- 플레이어 화면은 이제 세션 API 응답에 포함된 sanitized game을 사용
- 타 플레이어의 비밀/알리바이/승리 조건/승점 조건/관계 정보 제거
- GM 보드 메모/지도/라운드 미디어 제거

**결과**
- 이번 추가된 GM 전용 필드가 플레이어 쪽으로 그대로 새지 않도록 정리

### 2-5. 장소 카드 현황 정확도 보정

**조치**
- GM 직접 배포 단서도 `sharedState.acquiredClueIds`에 반영되도록 수정

**결과**
- GM 보드의 장소 카드 현황이 GM 배포 단서까지 포함해 더 정확해짐

---

## 3. 수정 파일

| 파일 | 작업 |
|---|---|
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | GM 메인 보드, 페이즈 영상 재생, 장소 카드 현황 패널 추가 |
| `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx` | 미사용 GM 입력 제거, 공통 GM 메모/지도 URL 추가 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | 라운드별 영상/BGM/GM 메모 입력 추가 |
| `src/types/game.ts` | `gmOverview`, `mapImageUrl`, `gmNote`, 라운드 미디어 필드 추가 |
| `src/lib/game-sanitizer.ts` | 참가/플레이어용 게임 sanitize 유틸 신규 |
| `src/app/api/join/[sessionCode]/route.ts` | 공개용 게임 sanitize 적용 |
| `src/app/api/sessions/[sessionId]/route.ts` | 플레이어 세션 응답에 sanitized game 포함 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 플레이어 화면이 session API에서 game을 함께 로드하도록 변경 |
| `src/app/api/sessions/[sessionId]/cards/route.ts` | GM 배포 단서도 acquired 상태 반영 |
| `src/app/api/games/route.ts` | 신규 필드 기본값 추가 |

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

## 5. 후속 아이디어

- GM 보드에 장소 카드 칩 외에 "누가 어떤 장소를 이미 방문했는지"까지 세션 단위로 확장
- 영상 외에 이미지 슬라이드/문서 뷰어도 같은 보드 영역에서 지원
- README에 GM 보드 사용법과 메이커 입력 가이드를 반영
