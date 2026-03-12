# 메이커 플로우 정리 + GM 보드 단순화 + 백로그 재정렬 — Codex GPT-5

- **날짜**: 2026-03-12
- **모델**: Codex GPT-5
- **범위**: GM 보드 미디어 전용 정리, 하드코딩 페이즈 가이드 제거, 타임라인 제거, 태그화, 제작 플로우 정리

---

## 1. 사용자 요청 요약

1. GM 보드는 정보가 너무 많으니 영상/이미지/배경음악 정도만 표시
2. 페이즈별 규칙/안내는 하드코딩이 아니라 메이커가 직접 입력하고 실제 GM 화면과 동기화
3. 현재 사건 타임라인 구현은 완전히 제거
4. 추후 타임라인은 on/off + 시간대별 + 캐릭터별 입력 구조로 재설계
5. 라운드별 설정의 "열리는 장소" 직접 입력 제거, 장소 설정을 단일 소스로 사용
6. 테마/분위기를 태그 입력 방식으로 통합
7. 페이즈 시간 설정에서 브리핑 제거
8. 제작 네비게이터 완료 체크 제거, 추후 검증 힌트는 백로그로 이동

---

## 2. 구현 내용

### 2-1. GM 보드 미디어 전용 정리

**조치**
- `GMDashboard.tsx`의 `GMBoard`를 축소
- 기존 보드에서 제거:
  - 공개 사건 설명
  - 공통 GM 메모
  - 라운드/엔딩 텍스트 블록
  - 사건 전 타임라인
  - 장소 리스트 / 카드 현황
- 유지한 요소:
  - 현재 페이즈 영상
  - 공통 이미지/지도
  - 현재 페이즈 배경음악 링크

**결과**
- GM 보드가 텍스트 패널이 아니라 실제 진행용 미디어 보드 역할에 집중하게 됨

### 2-2. 하드코딩 페이즈 가이드 제거

**조치**
- `GMDashboard.tsx`의 고정 안내 패널(`대기실 — 입장 확인`, `투표 페이즈` 등) 제거
- `ScriptEditor.tsx`에 다음 입력 구조를 정리:
  - 대기실
  - 오프닝
  - 라운드별
  - 투표
  - 공통 엔딩
  - 성공/실패 엔딩 분기
- 각 페이즈에 `GM 진행 가이드`, `나레이션`, `영상 URL`, `배경 음악 URL`을 직접 작성하도록 구성
- GM 화면의 `PhaseGuide`는 이제 스크립트 데이터만 읽어 렌더링

**결과**
- 런타임 안내가 코드에 박혀 있지 않고, 메이커 입력과 실제 플레이 화면이 직접 연결됨

### 2-3. 타임라인 현재 구현 제거

**조치**
- `StoryEditor.tsx`에서 사건 전 타임라인 입력 UI 삭제
- `GMDashboard.tsx`에서 타임라인 렌더링 제거
- `game-normalizer.ts`에서 기존 저장 데이터의 `story.timeline`은 빈 배열로 정규화

**결과**
- 기존 애매한 타임라인 구현은 화면/데이터 흐름에서 사실상 비활성화됨

### 2-4. 장소 오픈 정보의 단일 소스화

**조치**
- `ScriptEditor.tsx`의 라운드별 `unlockedLocationIds` 직접 입력 삭제
- 각 라운드 패널에서는 `locations[].unlocksAtRound`를 기준으로 열리는 장소를 읽기 전용 표시
- `game-normalizer.ts`에서 기존 라운드 스크립트의 `unlockedLocationIds`는 저장 시 빈 배열로 정리

**결과**
- 장소 오픈 타이밍은 장소 탭만 수정하면 되고, 스크립트 탭은 확인용 뷰만 제공

### 2-5. 태그 기반 설정으로 통합

**조치**
- `SettingsForm.tsx`와 `SettingsEditor.tsx`에서 `theme` + `tone` UI 제거
- `tags` 배열 기반 칩 입력 UI로 교체
  - 예시 태그 버튼
  - 직접 입력 후 추가
  - 클릭 삭제
- `GameCard.tsx`는 라이브러리 카드에 태그를 노출
- `game-normalizer.ts`는 기존 `theme`/`tone` 값을 새 `tags`로 마이그레이션

**결과**
- 제작자가 고정된 테마/분위기 선택지에 묶이지 않고 자유 태그 기반으로 관리 가능

### 2-6. 브리핑 제거 및 제작 네비게이터 정리

**조치**
- 기본 설정/편집기의 라운드 페이즈 설정에서 `브리핑` 제거
- 세션 API와 플레이어/GM 화면 모두 `조사 → 토론` 흐름 기준으로 정리
- 예전 `briefing` 값이 남아 있어도 `discussion`으로 흡수하도록 호환 처리
- `StepWizard.tsx`, `MakerEditor.tsx`, `new/page.tsx`에서 완료 체크 흐름 제거

**결과**
- 라운드 구조가 단순해졌고, 제작 네비게이터는 상태를 과장해 보여주지 않게 됨

### 2-7. README 백로그 재정렬

**조치**
- README 현재 구현 상태를 최신 구조로 수정
- `Next Steps`를 다음 백로그 중심으로 재작성
  - 타임라인 재설계
  - 제작 네비게이터 검증 힌트
  - 이후 기능들
- `npm run dev:tunnel` 안내도 유지

**결과**
- 문서와 실제 구현 상태가 다시 맞춰짐

---

## 3. 수정 파일

| 파일 | 작업 |
|---|---|
| `src/app/play/[gameId]/_components/GMDashboard.tsx` | GM 보드 미디어 전용 정리, 하드코딩 안내 제거, 동적 페이즈 가이드 적용 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | 대기실/투표 포함한 페이즈 편집 구조 재편, GM 진행 가이드 입력 추가, 라운드 장소 입력 제거 |
| `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx` | 타임라인 UI 제거, 대표 이미지 중심으로 단순화 |
| `src/app/maker/new/_components/SettingsForm.tsx` | 태그 입력 기반 설정, 브리핑 제거 |
| `src/app/maker/[gameId]/edit/_components/SettingsEditor.tsx` | 태그 입력 기반 설정, 브리핑 제거 |
| `src/app/maker/new/_components/StepWizard.tsx` | 완료 체크 없는 스텝 네비게이터 정리 |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | 완료 상태 제거, 새 ScriptEditor props 반영 |
| `src/app/maker/new/page.tsx` | StepWizard props 단순화 |
| `src/app/play/[gameId]/[charId]/page.tsx` | 플레이어 화면 서브페이즈 호환 정리 |
| `src/app/api/sessions/[sessionId]/route.ts` | 브리핑 제거, 레거시 sub-phase 호환 처리 |
| `src/lib/game-normalizer.ts` | 레거시 theme/tone → tags 변환, timeline 제거, 라운드 장소 입력 비활성화 |
| `src/lib/storage/game-storage.ts` | 게임 저장/목록 시 정규화 적용 |
| `src/lib/game-sanitizer.ts` | 새 스크립트 구조 sanitize 반영 |
| `src/app/library/_components/GameCard.tsx` | 태그 표시 |
| `src/types/game.ts` | tags, scripts, phase 타입 갱신 |
| `src/types/session.ts` | currentSubPhase 타입 정리 |
| `README.md` | 구현 상태 및 백로그 업데이트 |

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

## 5. 후속 백로그

- 타임라인 on/off, 시간대 슬롯, 캐릭터별 입력 구조 설계
- 제작 네비게이터의 필수 입력/단서 부족 검증 힌트 UI
- 조건부 단서 GM 수동 배포 보조
