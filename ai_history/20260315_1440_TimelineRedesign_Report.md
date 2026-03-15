# 타임라인 시스템 재설계 + 플레이어 타임라인 탭 구현 — Codex GPT-5

- **날짜**: 2026-03-15
- **모델**: Codex GPT-5
- **범위**: 시간대 슬롯 기반 타임라인 재설계, 중앙 입력 UI, 플레이어 전용 타임라인 탭

---

## 1. 사용자 요구 정리

사용자 설명 기준 구조는 다음으로 정리되었다.

- 스토리 계층:
  - 오프닝 스토리
  - 엔딩 스토리
  - 기본 전체 스토리
- 플레이어 계층:
  - 배경 스토리
  - 비밀
  - 알리바이용 타임라인

핵심 요구는 타임라인이 `시간대별 + 캐릭터별`로 모순 없이 입력되어야 하므로,
제작자가 캐릭터 폼을 하나씩 열지 않고 한곳에서 비교하며 입력할 수 있어야 한다는 점이었다.

또한 플레이어 개인 화면에서는 별도 `타임라인` 탭에서 본인 타임라인만 확인할 수 있어야 했다.

---

## 2. 구현 방향

- `Story.timeline`
  - 단순 배열 제거
  - `enabled + slots[]` 구조로 재설계
- `Player.timelineEntries`
  - 슬롯 ID 기준 행동/알리바이 저장
- 메이커 UI 분리
  - Step 2: 타임라인 on/off + 시간대 슬롯 정의
  - Step 3: 중앙 타임라인 입력 화면에서 시간대별로 모든 캐릭터 행동 입력
- 플레이어 UI 분리
  - 캐릭터 카드 탭과 별도로 `타임라인` 탭 추가

---

## 3. 구현 내용

### 3-1. 데이터 모델 재설계

- `src/types/game.ts`
  - `StoryTimeline`
  - `TimelineSlot`
  - `PlayerTimelineEntry`
  - `Player.timelineEntries`
  - `Story.timeline`을 새 구조로 전환

### 3-2. 정규화 / sanitize 보강

- `src/lib/game-normalizer.ts`
  - legacy `TimelineEvent[]` → 새 슬롯 구조 자동 변환
  - 플레이어 타임라인 엔트리를 슬롯 순서에 맞게 자동 정렬
- `src/lib/game-sanitizer.ts`
  - 타 플레이어 `timelineEntries` 제거

### 3-3. 메이커 입력 구조 변경

- `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx`
  - 타임라인 on/off 토글
  - 기본 시간대 슬롯 생성
  - 슬롯 추가 / 삭제 / 라벨 편집
- `src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx`
  - 캐릭터 개별 폼에서 타임라인 입력 제거
  - `중앙 타임라인` 뷰 추가
  - 시간대별로 모든 캐릭터 행동을 모아서 입력하는 매트릭스 UI 구현
- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
  - 스토리 타임라인 설정을 플레이어 편집기로 전달

### 3-4. 플레이어 화면 변경

- `src/app/play/[gameId]/[charId]/page.tsx`
  - `타임라인` 탭 추가
  - 플레이어 본인 슬롯별 행동만 노출
  - 기존 캐릭터 카드 탭에서는 타임라인 섹션 제거

### 3-5. 검증 힌트 반영

- `src/lib/maker-validation.ts`
  - 타임라인 활성화 시 슬롯 미정의 검증
  - 슬롯 라벨 누락 검증
  - 캐릭터별 타임라인 미입력 경고 추가

### 3-6. 새 게임 기본값 반영

- `src/app/api/games/route.ts`
  - 새 게임 생성 시 `timeline: { enabled: false, slots: [] }` 초기화

---

## 4. 검증

```bash
$ npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (10/10)
```

---

## 5. 현재 우선 백로그

타임라인 관련 우선 백로그는 이번 작업으로 구현 상태로 이동.

남은 주요 후속 기능:

- LLM 기반 시나리오 제작 도우미
- 카드 PDF 출력
- 게임 패키지 내보내기/가져오기
- 모바일 PWA 지원
