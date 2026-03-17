# 2026-03-17 메이커/플레이 흐름 리팩터링 작업 계획

## 목적

오늘 수정 범위는 Step 2, Step 3, Step 5, Step 6, 플레이어 화면, GM 보드, 세션 종료 흐름, 공개 데이터 정제 로직까지 함께 바뀐다.
단순 문구 수정이 아니라 입력 구조, 공개 타이밍, 엔딩 진행 방식이 바뀌므로 먼저 영향 범위를 고정하고 순서대로 진행해야 한다.

이번 작업의 목표는 다음 4가지다.

- 메이커 입력 흐름을 실제 플레이 진행 순서에 맞게 재배치한다.
- 플레이어 공개 정보와 GM 전용 정보를 다시 정리한다.
- 엔딩을 분기형 흐름으로 재설계하고 Step 6으로 분리한다.
- 기존 저장 데이터와 충돌하지 않도록 호환 레이어를 유지한다.

## 요청 사항 정리

### Step 2 사건 개요 / 오프닝

- 메이커 탭 명칭을 `사건 개요 / 오프닝`으로 더 명확하게 변경
- `배경 장소` 입력 제거
- `사건 설명`은 오프닝과 함께 Step 2에서 작성
- 현재 Step 5의 `오프닝` 작성 UI를 Step 2로 이동
- `피해자 정보`는 오프닝에서 자동 공개하지 않고 플레이어 화면의 인물 정보에서 확인하도록 변경
- 피해자 정보는 `이름`, `배경`, `사진(optional)`만 사용
- 기존 `사망 경위` 입력 제거
- 피해자 외 `NPC 인물`도 추가 가능하게 확장

### Step 3 플레이어

- 관계 대상이 플레이어만이 아니라 `피해자`, `NPC`도 선택 가능해야 함
- 플레이어 화면에서 `인물 정보`를 별도로 볼 수 있어야 함
- 인물 정보에는 `사진(optional)`, `이름`, `배경`, `각 캐릭터와의 관계` 노출
- 플레이어 화면의 `타임라인`은 상단 네비게이션 탭에서 제거하고 캐릭터 카드 하단 토글 영역으로 이동

### Step 5 스크립트

- Step 5의 역할을 `라운드별 가이드 / 미디어 / 이벤트 텍스트`로 더 구체화
- `대기실 나레이션` 제거
- `오프닝`은 Step 5에서 제거
- `투표` 텍스트가 플레이어 투표 화면에서 충분히 보이는지 별도 검토 필요
- 라운드별 `나레이션` 라벨을 `라운드 이벤트`로 변경
- 라운드 이벤트 입력이 비어 있으면 플레이 화면/GM 보드에서 노출하지 않음
- 기존 라운드 나레이션 토글 UI 제거

### Step 6 엔딩

- 엔딩은 복잡도가 높으므로 별도의 `6번 엔딩 탭`으로 분리
- 엔딩에는 `진행 가이드`가 필요 없음
- `공통 엔딩`은 제거
- 결과는 단순 `성공/실패`가 아니라 `검거된 캐릭터 기준 분기`로 설계
- 기본 분기는 `범인 검거`, `오검거(그 외 캐릭터 검거)`지만 게임에 따라 특정 캐릭터별 별도 엔딩도 가능해야 함
- 옵션을 켜면 `개인 엔딩`을 플레이어별로 따로 확인 가능해야 함
- 옵션을 켜면 `작가 추가 설명`을 GM 화면에서 개인 엔딩 이후 별도로 확인 가능해야 함
- 작가 추가 설명은 `항목`, `내용` 단위의 간단 입력 구조로 충분함

### 플레이어 / GM 흐름

- 현재는 투표 직후 한 화면에 공통 엔딩/성공/실패 엔딩이 함께 보이는데 이 구조를 해체해야 함
- 새 구조에서는 `투표 결과 공개 → 분기 공통 엔딩 → (옵션 시) 개인 엔딩 → (옵션 시) 작가 추가 설명` 순서로 진행
- `개인 엔딩`이 켜진 경우 플레이어는 각자 자기 화면에서 자기 개인 엔딩을 확인
- GM 화면에서는 개인 엔딩 전체를 캐릭터별 토글 목록으로 한 번에 열람 가능하게 구성

## 현재 코드 기준 영향 범위

### 직접 수정 대상

- `src/types/game.ts`
- `src/types/session.ts`
- `src/lib/game-normalizer.ts`
- `src/lib/maker-validation.ts`
- `src/lib/game-sanitizer.ts`
- `src/lib/ai/maker-assistant-context.ts`
- `src/app/api/games/route.ts`
- `src/app/api/sessions/[sessionId]/route.ts`
- `src/app/api/sessions/[sessionId]/vote/route.ts`
- `src/app/maker/new/_components/StepWizard.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx`
- `src/app/play/[gameId]/[charId]/page.tsx`
- `src/app/play/[gameId]/_components/GMDashboard.tsx`

### 간접 영향 대상

- 메이커 검증 경고 문구
- 메이커 assistant 컨텍스트 축약 필드
- 기존 JSON 저장본 로드 호환성
- 플레이어 공개 데이터 sanitize 규칙
- 세션 종료 시점과 이벤트 로그 메시지

## 현재 코드 기준 핵심 확인 사항

### 투표 텍스트 노출

현재 `VoteScreen`은 투표 UI만 보여주고 `game.scripts.vote.narration`을 플레이어 화면에 실제로 노출하지 않는다.
즉 Step 5에서 작성한 투표 안내 텍스트는 지금 기준으로 GM 보드에는 보이지만 플레이어 투표 화면 가독성은 부족하다.
공통 엔딩 제거 후에는 투표 직후 안내 문구의 역할이 더 중요해지므로, 이 지점은 별도 보완 대상으로 포함한다.

### 엔딩 구조

현재 엔딩은 다음 두 정보로만 처리된다.

- `SharedState.phase = "ending"`
- `VoteReveal.majorityCorrect: boolean`

이 구조로는 다음 요구를 처리할 수 없다.

- 특정 캐릭터 검거별 엔딩
- 개인 엔딩 단계
- 작가 추가 설명 단계
- GM이 `분기 엔딩 → 개인 엔딩 → 작가 추가 설명` 단계를 제어하는 흐름

즉 엔딩은 문구만 바꾸는 수준이 아니라 세션 상태 모델을 다시 설계해야 한다.

## 핵심 충돌 포인트

### 1. Step 2와 Step 5가 현재 완전히 분리돼 있음

현재 `MakerEditor`는 Step 2에서 `story`만, Step 5에서 `scripts`만 전달한다.
오프닝을 Step 2로 옮기려면 `StoryEditor`가 `story`와 `scripts.opening`을 같이 편집하거나, 공통 상위 컴포넌트에서 Step 2 전용 합성 props를 내려야 한다.

권장 방향:

- 내부 저장 구조는 당장 유지
- Step 2 UI만 `story + scripts.opening`을 함께 편집하도록 변경
- Step 5에서는 `opening` 탭/폼 제거

이 방식이 가장 안전하다. 저장 포맷을 한 번에 바꾸지 않아도 되기 때문이다.

### 2. Step 수가 5에서 6으로 늘어나며 Step 5의 역할도 달라짐

기존 Step 5는 `스크립트` 전체였지만 이제는 `라운드별 가이드 / 미디어 / 이벤트 텍스트` 중심이 된다.
엔딩은 Step 6으로 분리되어야 하므로 StepWizard, MakerEditor, 저장 기본값, validation 기준이 동시에 바뀐다.

권장 방향:

- Step 2: `사건 개요 / 오프닝`
- Step 5: `스크립트`
- Step 6: `엔딩`

### 3. 피해자/NPC 관계를 넣으려면 현재 `Relationship.playerId` 구조가 부족함

현재 관계는 `{ playerId, description }` 하나뿐이라 플레이어 외 대상이 들어갈 수 없다.
피해자/NPC를 넣으려면 관계 대상을 일반화해야 한다.

권장 방향:

- `Relationship`를 아래 구조로 확장
- 기존 저장본은 normalizer에서 자동 변환

예상 구조:

```ts
type RelationshipTargetType = "player" | "victim" | "npc";

interface Relationship {
  targetType: RelationshipTargetType;
  targetId: string;
  description: string;
  playerId?: string; // legacy 호환용 읽기 전용
}
```

### 4. 플레이어 화면의 인물 정보는 sanitize 정책과 같이 바뀌어야 함

현재 `buildGameForPlayer()`는 타 플레이어의 `relationships`, `timelineEntries`, `story`, `secret` 등을 제거한다.
새 요구사항은 `피해자/NPC 정보`와 `각 캐릭터와의 관계`를 플레이어에게 공개해야 한다.

즉 다음 분리가 필요하다.

- 비공개: 개인 스토리, 비밀, 점수 조건, 타임라인, 개인 단서 위치 메모
- 공개: 피해자/NPC 기본 정보, 공개 캐릭터 배경, 인물 관계 설명

이 공개 범위 정의를 먼저 고정하지 않으면 Step 3과 플레이어 화면이 서로 어긋난다.

### 5. `나레이션` 필드명은 넓게 쓰이고 있어서 바로 타입명까지 바꾸면 영향이 큼

현재 `ScriptSegment.narration`, `RoundScript.narration`은 검증, GM 보드, sanitize, assistant context에서 모두 사용 중이다.
오늘 범위에서 타입 필드명까지 `storyText`, `eventText`로 바꾸면 수정 범위가 과해진다.

권장 방향:

- 이번 작업에서는 내부 필드명 `narration` 유지
- UI 라벨만 `스토리 텍스트`, `라운드 이벤트`로 변경
- 엔딩만 별도 구조로 분리

이렇게 해야 저장 데이터 migration 없이 Step 2/5 작업부터 안전하게 진행할 수 있다.

### 6. 현재 엔딩 모델이 `majorityCorrect` 기준이라 분기 정보가 지나치게 단순함

현재는 `VoteReveal.majorityCorrect`만으로 성공/실패를 판단한다.
하지만 새 요구는 “어떤 캐릭터가 최종 검거 대상으로 결정됐는가”가 핵심이다.

필요한 정보:

- 최종 검거 대상 `arrestedPlayerId`
- 분기 결과 타입 `culprit-captured | wrong-arrest`
- 적용된 엔딩 브랜치 `resolvedBranchId`
- 현재 엔딩 단계 `branch | personal | author-notes | complete`

### 7. 동률 처리 규칙이 필요함

특정 캐릭터 검거별 엔딩을 만들려면 최종 검거 대상이 1명으로 확정되어야 한다.
현재 코드는 단순 tally만 만들고 tie 처리 규칙이 없다.

권장 방향:

- 최다 득표 1명이면 자동 확정
- 최다 득표 동률이면 GM이 검거 대상을 선택하고 나서 엔딩 단계로 진행

이 규칙이 없으면 특정 캐릭터 엔딩 분기가 설계상 불완전하다.

### 8. 현재 엔딩 화면은 모든 텍스트를 한 페이지에 합쳐 보여준다

현재 플레이어 엔딩 화면은 `공통 엔딩 + 성공/실패 엔딩 + 결과 요약`을 한 페이지에 동시에 렌더링한다.
새 요구는 단계형 전개이므로 이 구조를 해체해야 한다.

새 흐름:

- 투표 결과 공개
- 분기 엔딩 텍스트 표시
- GM 조작으로 개인 엔딩 단계 진입
- 플레이어 각자가 자기 개인 엔딩 확인
- GM 조작으로 작가 추가 설명 공개

## 권장 데이터 구조 변경

### Story

오늘 작업에서는 아래 방향으로 확장하는 것이 적절하다.

```ts
interface VictimInfo {
  name: string;
  background: string;
  imageUrl?: string;
  deathCircumstances?: string; // legacy
}

interface StoryNpc {
  id: string;
  name: string;
  background: string;
  imageUrl?: string;
}

interface Story {
  synopsis: string;
  victim: VictimInfo;
  npcs: StoryNpc[];
  incident: string;
  gmOverview?: string;
  mapImageUrl?: string;
  timeline: StoryTimeline;
  culpritPlayerId: string;
  motive: string;
  method: string;
  location?: string; // legacy
}
```

핵심은 `피해자`는 단일 공개 인물, `NPC`는 다수 공개 인물로 둔다는 점이다.

### Ending

엔딩은 `scripts` 내부의 단순 세그먼트가 아니라 별도 도메인으로 분리하는 편이 맞다.

예상 구조:

```ts
interface EndingBranch {
  id: string;
  label: string;
  triggerType: "culprit-captured" | "specific-player-arrested" | "wrong-arrest-fallback";
  targetPlayerId?: string;
  storyText: string;
  videoUrl?: string;
  backgroundMusic?: string;
}

interface PersonalEnding {
  playerId: string;
  title?: string;
  text: string;
}

interface AuthorNote {
  id: string;
  title: string;
  content: string;
}

interface EndingConfig {
  branches: EndingBranch[];
  personalEndingsEnabled: boolean;
  personalEndings: PersonalEnding[];
  authorNotesEnabled: boolean;
  authorNotes: AuthorNote[];
}
```

핵심 원칙:

- 엔딩에는 `gmNote`를 두지 않음
- 공통 엔딩은 두지 않음
- 특정 캐릭터 체포 분기를 우선 지원
- 개인 엔딩/작가 노트는 옵션 토글로 제어

### Session / Vote Resolution

세션 상태도 엔딩용 하위 단계를 가져야 한다.

예상 구조:

```ts
type EndingStage = "branch" | "personal" | "author-notes" | "complete";

interface VoteReveal {
  tally: VoteTally[];
  culpritPlayerId: string;
  arrestedPlayerId: string;
  resultType: "culprit-captured" | "wrong-arrest";
  resolvedBranchId?: string;
}

interface SharedState {
  phase: GamePhase;
  endingStage?: EndingStage;
  voteReveal?: VoteReveal;
}
```

핵심은 `결과 요약`과 `엔딩 진행 단계`를 분리하는 것이다.

## 오늘 구현 순서

### 1. 타입/정규화/공개 데이터 규칙 정리

- `src/types/game.ts`
- `src/types/session.ts`
- `src/lib/game-normalizer.ts`
- `src/lib/game-sanitizer.ts`
- `src/lib/maker-validation.ts`
- `src/lib/ai/maker-assistant-context.ts`
- `src/app/api/games/route.ts`

할 일:

- `Story.npcs` 추가
- `VictimInfo.imageUrl` 추가
- `Relationship` 대상 일반화
- `EndingConfig` 추가
- legacy `playerId`, `story.location`, `deathCircumstances`, 기존 ending 필드 읽기 호환 유지
- validation 기준을 새 구조로 변경
- assistant context에서 `location`, `roundsWithoutNarration`, 구식 ending 필드를 정리

### 2. 세션 투표/엔딩 상태 모델 정리

- `src/types/session.ts`
- `src/app/api/sessions/[sessionId]/route.ts`
- `src/app/api/sessions/[sessionId]/vote/route.ts`

할 일:

- `VoteReveal`을 `majorityCorrect` 중심에서 `arrestedPlayerId` 중심 구조로 변경
- 엔딩 단계 `endingStage` 추가
- 동률 시 GM 선택 흐름 설계
- 분기 엔딩 공개 후 개인 엔딩/작가 노트 단계로 넘기는 PATCH 액션 설계

### 3. Step 2 리팩터링

- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx`
- `src/app/maker/new/_components/StepWizard.tsx`

할 일:

- Step 2 제목/설명 변경: `사건 개요 / 오프닝`
- `StoryEditor`가 `story`와 `scripts.opening`을 함께 편집
- 피해자 정보 폼 축소: 이름/배경/사진
- NPC 추가/삭제 UI 구성
- 사건 설명 + 오프닝 스토리 텍스트를 Step 2에 배치
- 배경 장소 입력 제거

### 4. Step 5 축소 및 역할 재정의

- `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx`
- `src/app/maker/new/_components/StepWizard.tsx`

할 일:

- Step 5 설명을 `라운드별 가이드 / 미디어 / 이벤트 텍스트`로 정리
- `lobby`에서 나레이션 입력 제거
- `opening` 탭 제거
- `vote` 텍스트 입력/노출 위치를 재점검
- 라운드 라벨을 `라운드 이벤트`로 변경
- 라운드 이벤트 미입력 시 경고는 완화하고 노출도 숨김
- 관련 예시/도움말 문구 전부 동기화

### 5. Step 6 엔딩 에디터 추가

- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
- `src/app/maker/[gameId]/edit/_components/EndingEditor.tsx` 신규
- `src/app/maker/new/_components/StepWizard.tsx`

할 일:

- 6번 엔딩 탭 추가
- 분기 엔딩 목록 편집 UI 추가
- 특정 캐릭터 검거 트리거 선택 UI 추가
- 개인 엔딩 on/off 및 플레이어별 텍스트 입력 UI 추가
- 작가 추가 설명 on/off 및 항목/내용 입력 UI 추가
- 엔딩에는 진행 가이드 필드를 두지 않음

### 6. Step 3 관계 대상 확장

- `src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx`

할 일:

- 관계 대상 선택 목록을 `플레이어 / 피해자 / NPC` 통합 옵션으로 교체
- 현재 플레이어 자신 제외 처리 유지
- 삭제된 NPC/피해자 변경 시 dangling relation 정리 로직 추가

### 7. 플레이어 화면 리팩터링

- `src/app/play/[gameId]/[charId]/page.tsx`

할 일:

- 오프닝 화면에서 피해자 카드 자동 노출 제거
- 캐릭터 탭 내부에 `인물 정보` 섹션 또는 토글 블록 추가
- 인물 정보에는 피해자/NPC 목록 표시
- 각 인물 카드에 `사진`, `이름`, `배경`, `내 캐릭터와의 관계` 노출
- 타임라인 상단 탭 제거
- 타임라인을 캐릭터 카드 하단 토글 섹션으로 이동
- 투표 화면에 Step 5의 투표 안내 텍스트가 읽기 좋게 노출되는지 보완
- 엔딩 화면을 단계형 구조로 변경
- 개인 엔딩 단계에서는 각 플레이어가 자기 개인 엔딩만 확인하도록 변경

### 8. GM 보드 / GM 진행 흐름 정리

- `src/app/play/[gameId]/_components/GMDashboard.tsx`

할 일:

- `GM Board` 텍스트 라벨 제거
- 라운드 이벤트/오프닝 스토리 텍스트가 있으면 상단 노출
- 영상/공통이미지/배경음악은 값이 없으면 패널 자체 숨김
- 빈 패널 안내 문구 제거
- 분기 엔딩 공개 후 `개인 엔딩 단계 진입`, `작가 노트 보기` 같은 GM 제어 버튼 추가
- GM 화면에서는 개인 엔딩 전체를 캐릭터별 토글/아코디언으로 열람 가능하게 구성

## 구현 시 세부 원칙

### 원칙 1. 저장 포맷의 급격한 rename은 피한다

오늘은 UI 재배치와 엔딩 흐름 정리가 우선이다.
`scripts.opening.narration`, `round.narration` 같은 기존 필드는 당장 내부 이름을 바꾸지 않고 UI 라벨만 바꾼다.

### 원칙 2. 엔딩은 별도 구조로 분리한다

엔딩은 Step 6과 세션 단계 제어까지 들어가므로 `scripts` 안의 단순 세그먼트로 다루기 어렵다.
새 요구사항은 별도 `EndingConfig`로 분리하는 편이 구조상 맞다.

### 원칙 3. legacy 데이터는 읽되 새 화면에서는 감춘다

- `story.location`
- `victim.deathCircumstances`
- `Relationship.playerId`
- `scripts.ending`
- `scripts.endingSuccess`
- `scripts.endingFail`

이 값들은 즉시 삭제하지 말고 호환용으로만 읽는다.

### 원칙 4. 공개 정보와 비공개 정보를 다시 분리한다

플레이어에게 보여야 하는 “공개 인물 정보”, “분기 엔딩”, “개인 엔딩”은 sanitize 단계에서 명확히 갈라야 한다.

## 예상 회귀 위험

### 위험 1. 기존 게임 JSON 로드 시 빈 값/undefined 충돌

대응:

- normalizer에서 `npcs: []`, `ending` 기본값 보장
- `Relationship` legacy 변환 처리
- 구 ending 필드에서 새 `ending.branches`로 1회 매핑 지원

### 위험 2. Step 2에서 opening을 편집하지만 저장이 scripts로 안 들어갈 수 있음

대응:

- `MakerEditor`에서 Step 2 전용 `onChangeStory`, `onChangeOpening`을 분리
- 저장 후 새로고침 기준으로 즉시 검증

### 위험 3. 플레이어 화면에서 인물 정보가 sanitize 때문에 비어 보일 수 있음

대응:

- `game-sanitizer` 수정 이후 플레이어 화면부터 먼저 확인

### 위험 4. 라운드 이벤트 숨김 처리 후 GM이 “입력했는데 왜 안 보이지” 상태가 될 수 있음

대응:

- 공백 trim 기준으로만 숨김
- Step 5에 “비워 두면 노출되지 않음” 힌트 명시

### 위험 5. 피해자/NPC 삭제 후 관계 참조가 남을 수 있음

대응:

- 관계 대상 목록 재계산 시 없는 targetId는 저장 시 자동 제거

### 위험 6. 특정 캐릭터 검거형 엔딩에서 동률 처리 누락

대응:

- GM 선택 단계 없이는 엔딩 단계로 넘어가지 않도록 설계

### 위험 7. 엔딩 단계 동기화가 어긋나 플레이어마다 다른 화면이 보일 수 있음

대응:

- `SharedState.endingStage`를 SSE와 폴링 둘 다로 동기화
- 개인 엔딩은 플레이어별 텍스트 선택이 아니라 `내 playerId` 기준 렌더링으로 처리

### 위험 8. 공통 엔딩 제거 후 투표 결과와 엔딩 사이 연결이 약해질 수 있음

대응:

- 투표 결과 카드와 분기 엔딩 텍스트의 시각 hierarchy를 분리
- 투표 안내 텍스트와 엔딩 전환 문구를 별도로 점검

## 수동 검증 체크리스트

### 메이커

- 기존 게임을 열어도 Step 2/3/5/6이 깨지지 않는지
- Step 2에서 오프닝 스토리 텍스트를 저장하면 새로고침 후 유지되는지
- 피해자 사진/NPC 추가가 저장되는지
- NPC 삭제 후 플레이어 관계가 안전하게 정리되는지
- Step 6에서 분기 엔딩, 개인 엔딩, 작가 노트 입력이 저장되는지

### 투표 / 엔딩 흐름

- 투표 화면에서 안내 텍스트가 실제로 읽기 좋게 보이는지
- 최다 득표 1명일 때 자동으로 해당 캐릭터 엔딩 분기가 선택되는지
- 동률일 때 GM이 검거 대상을 선택할 수 있는지
- 분기 엔딩 후 GM 버튼으로 개인 엔딩 단계로 넘어가는지
- 개인 엔딩 on 상태에서 각 플레이어가 자기 개인 엔딩만 확인하는지
- GM 화면에서 모든 개인 엔딩이 토글 목록으로 열람되는지
- 작가 추가 설명 on 상태에서 개인 엔딩 이후 GM 화면에만 노출되는지

### 플레이어

- 오프닝 진입 시 사건 설명은 보이고 피해자 카드는 자동 노출되지 않는지
- 캐릭터 탭 안에서 인물 정보가 정상 노출되는지
- 관계 대상이 피해자/NPC일 때 이름과 관계 설명이 맞게 보이는지
- 타임라인이 상단 탭에서 사라지고 캐릭터 카드 하단에서만 열리는지
- 엔딩 화면이 단계형으로 바뀌고 현재 단계에 맞는 내용만 보이는지

### GM

- 빈 영상/이미지/음악 패널이 숨겨지는지
- 라운드 이벤트 입력이 있을 때만 상단에 노출되는지
- `GM Board` 라벨이 제거됐는지
- 엔딩 단계 전환 버튼들이 의도한 순서로 동작하는지

## 오늘 작업의 권장 진행 단위

1. 타입/normalizer/sanitizer/validation 정리
2. 세션 투표/엔딩 상태 모델 정리
3. Step 2 이동 작업
4. Step 5 역할 재정의
5. Step 6 엔딩 에디터 추가
6. Step 3 관계 대상 확장
7. 플레이어 화면 인물 정보/타임라인/투표/엔딩 이동
8. GM 보드 및 GM 진행 제어 정리
9. 기존 저장본 기준 수동 회귀 점검

## 메모

이번 작업은 “오프닝 공개 정보”, “인물 정보 공개 구조”, “스크립트 라벨/노출 규칙”, “엔딩 단계형 전개”가 한 번에 연결된다.
특히 엔딩은 현재 `majorityCorrect + phase=ending` 구조로는 감당이 안 되므로, 세션 모델을 먼저 손보지 않으면 UI 작업이 전부 임시방편이 된다.
반드시 타입/normalizer/sanitizer와 세션 상태를 먼저 고치고 UI를 올리는 순서로 진행한다.
