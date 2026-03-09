# 메이커 UX 개선 & 기본 설정 편집 — 작업 보고서

- 날짜: 2026-03-09
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt
- 게임 수정(편집 모드)에서 탭 클릭으로 자유롭게 이동할 수 있게
- 이미 제작된 게임의 기본 설정(Step 1)도 수정 가능하게
- 로직상 고정해야 할 항목만 수정 불가로 두고, 변경 시 경고 표시
- 밀담/카드 주고받기 토글 버튼 버그 수정

## 2. Thinking Process

### 탭 자유 이동
- `StepWizard`에 `allClickable` prop 추가 → 편집 모드에서 조건 없이 모든 탭 클릭 가능
- `MakerEditor`의 `completedSteps` 초기값을 `Set([1,2,3,4,5])` 로 변경
- `currentStep` 초기값 2 → 1 (기본 설정부터 시작)
- `onStepClick` 핸들러 조건 제거 → `setCurrentStep(step)` 단순화

### 기본 설정 편집 (SettingsEditor)
- 기존 Step 1은 "수정 불가" 안내만 표시했음
- `SettingsEditor.tsx` 신규 컴포넌트 생성 (편집 모드 전용 controlled component)
- 제목, 테마, 난이도, 분위기, 소요시간, 게임규칙 모두 편집 가능
- 진짜 제한 없음: `playerCount`는 캐릭터 수와의 일치 여부를 경고로만 표시 (수정은 허용)
  - 일치: "✓ 등록된 캐릭터 N명과 일치합니다" (green)
  - 불일치: "⚠ 현재 N명의 캐릭터가 등록되어 있습니다" (yellow)
  - 변경 시: "플레이어 탭에서 직접 조정하세요" 안내

### 토글 버튼 버그 수정
- 원인: `rules.privateChat` / `rules.cardTrading`이 구버전 게임 JSON에서 undefined
- 클릭 시 `TypeError: Cannot read properties of undefined` 발생
- 수정: `privateChat`, `cardTradingEnabled` 로컬 변수에 nullish coalescing 기본값 적용
```typescript
const privateChat = rules?.privateChat ?? { enabled: true, maxGroupSize: 3, durationMinutes: 5 };
const cardTradingEnabled = rules?.cardTrading?.enabled ?? true;
```
- JSX 전체에서 `rules.privateChat.X` → `privateChat.X` 교체

## 3. Execution Result

### 수정/생성된 파일

| 파일 | 변경 내용 |
|------|-----------|
| `src/app/maker/new/_components/StepWizard.tsx` | `allClickable` prop 추가; 모바일 점 탭도 클릭 가능하게 |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | `completedSteps` 전체 초기화, `currentStep=1`, Step1에 SettingsEditor 렌더 |
| `src/app/maker/[gameId]/edit/_components/SettingsEditor.tsx` | **신규 생성** — 편집 모드 기본 설정 전용 controlled component |

### SettingsEditor 구조
- 제목, 테마, 난이도, 분위기, 소요시간 편집
- 게임 규칙: 라운드 수, 페이즈 시간, 밀담 설정, 카드 거래 온오프
- playerCount 변경 시 캐릭터 수 불일치 경고 (실시간 + 변경 시)
- `rules.privateChat / cardTrading` undefined 방어 처리

### 빌드 검증
- `npx tsc --noEmit` → 에러 없음
- `npm run build` → 성공

## 4. 다음 단계
- [ ] GM/메이커 공개 정보 vs 내부 메모 용어 정리
- [ ] 페이즈 타이머 (GM 화면 카운트다운)
- [ ] 조건부 단서 GM 수동 배포 지원
