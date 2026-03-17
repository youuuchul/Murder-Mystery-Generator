# 2026-03-17 추가 수정 작업 계획

## 목적

이 문서는 기존 메이커/플레이 흐름 리팩터링 이후 추가로 나온 후속 요구를 정리한다.
이번 범위는 단순 문구 수정이 아니라 다음 5개 축이 다시 연결된다.

- Step 1 표지 이미지와 라이브러리 썸네일
- Step 2 오프닝/배경 설정 재배치
- Step 4 단서/장소 공개 모델 재설계
- Step 5 라운드 이미지 상속 규칙
- Step 6 분기별 개인 엔딩 구조

기존 구현을 크게 깨지 않으려면 저장 모델과 노출 정책을 먼저 고정하고, 이후 메이커 UI와 플레이/GM 화면을 순서대로 맞춰야 한다.

## 새 요청 정리

### 1. Step 1 표지 이미지

- 기본 설정에서 표지 이미지 업로드 가능해야 함
- 라이브러리 카드의 `FILE` 자리 대신 표지 이미지가 있으면 실제 썸네일로 노출
- 표지 이미지는 새 게임/기존 게임 저장 구조에 반영되어야 함

### 2. 단서/장소 모델 개편

- 단서의 `연관 정보 (GM 메모용)` 제거
- `GM 직접 배포` 제거
- 장소가 특정 라운드에 열릴 때, 그 장소에 배치된 공개형 단서는 플레이어가 획득이 아니라 바로 내용 확인 가능해야 함
- 단서 유형을 아래 3개로 단순화
  - `물적 증거`
  - `증언`
  - `현장 단서`
- `현장 단서`는 공개형이며 인벤토리에 들어가지 않음
- 공개형 단서는 GM도 보드에서 확인 가능하고 플레이어도 장소에서 바로 읽을 수 있어야 함

### 3. Step 2 오프닝 / 배경 설정 재배치

- Step 2 이름을 `오프닝 / 배경 설정`으로 변경
- 기존 `사건 설명` 입력은 제거
- 오프닝 스토리 텍스트를 가장 위로 이동
- Step 2 구성 순서는 아래 기준으로 정리
  - 오프닝 블록
  - 범인 지정
  - 대표 지도
  - 피해자 정보
  - NPC 인물
  - 행동 타임라인
- 범인 지정 UI의 `GM only` 문구는 제거

### 4. 라운드 대표 지도 / 참고 이미지 상속

- 기본 지도/참고 이미지는 Step 2 대표 지도를 따라감
- 각 라운드에서 별도 이미지를 입력한 경우에만 해당 라운드 이미지로 덮어씀
- 입력이 없으면 항상 Step 2 대표 지도를 그대로 사용

### 5. 분기별 개인 엔딩

- 개인 엔딩은 전역 설정이 아니라 `분기 엔딩 하위 옵션`으로 붙어야 함
- 각 분기마다 `개인 엔딩 사용 안 함 / 사용 중` 토글 필요
- 플레이어는 자신에게 해당하는 분기의 개인 엔딩만 확인해야 함
- GM 화면도 현재 분기에 연결된 개인 엔딩만 열람하면 됨

## 영향 범위

### 직접 수정 대상

- `src/types/game.ts`
- `src/lib/game-normalizer.ts`
- `src/lib/maker-validation.ts`
- `src/lib/game-sanitizer.ts`
- `src/lib/storage/game-storage.ts`
- `src/app/api/games/route.ts`
- `src/app/api/games/[gameId]/assets/route.ts`
- `src/app/maker/new/_components/StepWizard.tsx`
- `src/app/maker/[gameId]/edit/_components/SettingsEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/LocationEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/EndingEditor.tsx`
- `src/app/play/[gameId]/[charId]/page.tsx`
- `src/app/play/[gameId]/_components/GMDashboard.tsx`
- `src/app/library/_components/GameCard.tsx`

### 간접 영향 대상

- `src/app/api/sessions/[sessionId]/cards/route.ts`
- 엔딩 단계 전환 유틸
- 기존 저장 데이터 호환 로직
- 수동 스모크 테스트 시나리오

## 핵심 충돌 포인트

### 1. 표지 이미지는 메이커 Step 1, 저장 포맷, 라이브러리 메타데이터가 같이 바뀌어야 함

표지 이미지를 `SettingsEditor`에서만 붙이면 라이브러리 썸네일에서 쓸 수 없다.
메타데이터 생성 단계까지 내려가야 리스트 화면에서 빠르게 렌더할 수 있다.

권장 방향:

- `GameSettings.coverImageUrl` 추가
- metadata에도 함께 기록
- 에셋 업로드 API는 `locations`만이 아니라 `covers`도 지원하도록 일반화

### 2. 현장 단서는 현재 카드 획득 모델과 동작 방식이 다름

현재 단서는 모두 인벤토리에 들어가는 전제다.
`현장 단서`는 공개형이므로 아래가 달라져야 한다.

- 획득 API에서 인벤토리 추가하지 않음
- `acquiredClueIds` 충돌 로직 적용 제외
- 라운드 획득 수 제한 제외
- 장소 화면에서는 `획득` 대신 `내용 확인`

권장 방향:

- 단서 타입을 `physical | testimony | scene`으로 축소
- `scene`은 공개형 단서로 처리
- `document`는 legacy로만 읽고 `testimony` 또는 `physical`로 정규화하지 않고, 우선 `scene` 또는 `physical` 중 명시적 매핑 규칙 필요

### 3. Step 2에서 `story.incident`를 계속 유지할지 정해야 함

현재 플레이어 오프닝 화면은 `opening.narration`과 `story.incident`를 둘 다 보여준다.
요구사항은 오프닝 스토리 텍스트를 맨 위로 올리고 사건 개요는 제거하는 쪽이다.

권장 방향:

- 새 UI에서는 `story.incident` 입력 제거
- 플레이어 오프닝 화면도 `opening.narration` 중심으로 단순화
- `story.incident`는 legacy 데이터 호환용으로만 남김

### 4. 라운드 이미지 상속은 기존 `story.mapImageUrl`와 `round.videoUrl/backgroundMusic` 사이에 새 축이 추가됨

지금은 공통 이미지는 `story.mapImageUrl` 하나뿐이다.
라운드별 덮어쓰기를 하려면 `RoundScript`에 이미지 필드가 추가되어야 한다.

권장 방향:

- `RoundScript.imageUrl?: string` 추가
- 플레이어/GM 화면은 `round.imageUrl ?? story.mapImageUrl` 규칙 사용
- 입력이 없으면 패널은 숨기지 않고 상위 공통 이미지를 계속 사용

### 5. 개인 엔딩이 전역 배열이면 분기별 요구를 만족할 수 없음

현재는 `ending.personalEndingsEnabled + personalEndings[]` 전역 구조다.
새 요구는 분기마다 개인 엔딩 on/off가 달라야 한다.

권장 방향:

- `EndingBranch` 내부에 개인 엔딩 설정을 중첩
- legacy 전역 개인 엔딩은 fallback migration 용도로만 유지 후 새 구조로 흡수

예상 구조:

```ts
interface BranchPersonalEnding {
  playerId: string;
  title?: string;
  text: string;
}

interface EndingBranch {
  id: string;
  label: string;
  triggerType: "culprit-captured" | "specific-player-arrested" | "wrong-arrest-fallback";
  targetPlayerId?: string;
  storyText: string;
  videoUrl?: string;
  backgroundMusic?: string;
  personalEndingsEnabled?: boolean;
  personalEndings?: BranchPersonalEnding[];
}
```

## 구현 순서

### 1. Step 1 표지 이미지 파이프라인

- `GameSettings.coverImageUrl` 추가
- 게임 메타데이터에 표지 이미지 반영
- 에셋 업로드 API에 `covers` 경로 지원
- `SettingsEditor`에 표지 업로드/미리보기 UI 추가
- 라이브러리 `GameCard`에서 표지 이미지 렌더

### 2. 단서 타입 / 공개형 현장 단서 모델 정리

- `Clue.type`을 3종으로 축소
- `pointsTo`, `isSecret` 제거
- 공개형 현장 단서 동작 규칙 정의
- 장소/단서 에디터에서 UI 재구성
- 세션 카드 API에서 `scene` 동작 분기

### 3. Step 2 오프닝 / 배경 설정 재배치

- Step 2 라벨/설명 변경
- `StoryEditor` 블록 순서 재정렬
- `사건 설명` 입력 제거
- 범인 지정 블록을 Step 2 안에서 더 명확하게 정리

### 4. Step 5 라운드 이미지 상속 규칙

- `RoundScript.imageUrl` 추가
- 스크립트 에디터에 라운드 이미지 override 입력 추가
- GM/플레이어 화면에 공통 이미지 fallback 적용

### 5. Step 6 분기별 개인 엔딩 재구성

- 엔딩 타입을 분기 하위 개인 엔딩 구조로 변경
- 엔딩 에디터 UI를 분기별 토글형으로 재구성
- 플레이어/GM 엔딩 화면도 현재 분기 기준으로만 렌더링

### 6. 수동 검증

- 표지 이미지 업로드 후 라이브러리 노출 확인
- 공개형 현장 단서가 장소에서 바로 읽히는지 확인
- 오프닝/지도/라운드 이미지 상속 확인
- 분기별 개인 엔딩 노출 확인

## 커밋 단위

1. 표지 이미지 지원
2. 단서 타입 및 공개형 현장 단서
3. Step 2 오프닝 / 배경 설정 재배치
4. 라운드 이미지 상속
5. 분기별 개인 엔딩
6. 수동 스모크 수정

## 메모

이번 후속 작업은 `현장 단서`와 `분기별 개인 엔딩`이 가장 구조적이다.
표지 이미지는 비교적 독립적이라 첫 커밋으로 끊기 좋고, 이후 단서 모델을 먼저 정리해야 플레이어/GM 화면을 다시 만질 때 중복 수정이 줄어든다.
