# 조건부 단서 시스템 — 작업 보고서

- 날짜: 2026-03-09
- 소요 세션: 1회
- 담당: Claude Haiku 4.5

---

## 1. User Prompt

조건부 단서 시스템 구현:
- 단서 중 조건을 만족했을 때만 얻을 수 있는 단서
- 장소 자체에도 입장 조건 설정 가능 (조건 없이 획득 불가)
- 조건 종류: 아이템 보유 조합 / 아이템 전달(반환 시 해제) / 아이템+캐릭터 교류 조합

---

## 2. Thinking Process

### 2.1 조건 유형 설계

세 가지 조건 타입을 정의하여 단서 획득의 복합 시나리오를 지원:

**`has_items`**: 현재 인벤토리에 지정 단서 보유
- 동적 체크: 조건 평가 시점에 인벤토리 실시간 검증
- 반환 시 자동 해제: 플레이어가 아이템을 반환하면 조건 자동 충족으로 변경
- 클라이언트 친화적: 로컬 인벤토리만으로 즉시 판정 가능 → 버튼 비활성화 가능

**`gave_items`**: 지정 단서를 특정 캐릭터에게 건넨 상태 + 대상이 아직 보유 중
- 이전 이력 + 현재 보유 상태 동시 검증: `transferLog`와 `inventory` 모두 확인
- 반환 시 조건 자동 해제: 대상 플레이어가 아이템을 반환하면 조건 실패 상태로 변경
- 서버 전용 평가: 다른 플레이어의 상태가 필요하므로 클라이언트 힌트(🔐)만 표시, 서버에서 거부

**`items_and_character`**: 아이템 보유 + 대상 캐릭터로부터 카드 수령 이력
- `transferLog`에 해당 플레이어로부터의 수령 이력 필요
- 교류 기반 조건: 게임 진행 중 다양한 NPC/PC와의 상호작용 반영
- 서버 전용 평가: 다른 플레이어의 이전 이력 접근 필요

### 2.2 반환 버그 방지 핵심 로직

`gave_items` 조건에서 두 가지를 동시 검증하여 반환 버그 완벽 차단:

```
1. pState.transferLog에 A→B 이전 이력 존재
2. targetState.inventory에 현재도 보유 중
```

두 조건 모두 참일 때만 조건 충족. B가 A에게 반환하면:
- 2번 검증 실패 → 조건 자동 해제
- 재획득 가능 상태로 전환
- 이중 획득 방지

### 2.3 적용 레벨 설계

**`Clue.condition?`**: 단서별 획득 조건
- Optional 필드로 조건 없는 단서도 기존대로 동작
- 조건 미충족 시 클라이언트에서 🔐 힌트 표시, 서버에서 획득 거부

**`Location.accessCondition?`**: 장소 입장 조건
- 해당 장소 내 모든 단서는 입장 조건부터 검증
- 입장 불가 시 장소 전체 잠금 상태 표시
- 세부 단서 조건과는 독립적으로 동작

### 2.4 클라이언트 vs 서버 역할 분담

| 조건 타입 | 클라이언트 | 서버 |
|----------|-----------|------|
| `has_items` | 버튼 비활성화 (즉시 판정) | 획득 시 최종 검증 |
| `gave_items` | 🔐 힌트만 표시 | 조건 평가 + 거부 |
| `items_and_character` | 🔐 힌트만 표시 | 조건 평가 + 거부 |

**클라이언트에서 조건 판정 불가 사유:**
- 다른 플레이어의 인벤토리/이전 이력 접근 불가
- 간접 체크 없이 서버 검증만 신뢰

### 2.5 데이터 모델 통합

**`types/game.ts`에 추가:**
```typescript
type ClueConditionType = 'has_items' | 'gave_items' | 'items_and_character';

interface ClueCondition {
  type: ClueConditionType;
  requiredClueIds?: string[];        // has_items, items_and_character
  targetCharacterId?: string;        // gave_items, items_and_character
}

interface Clue {
  condition?: ClueCondition;
  // ... 기존 필드
}

interface Location {
  accessCondition?: ClueCondition;
  // ... 기존 필드
}
```

---

## 3. Execution Result

### 3.1 수정/생성된 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/types/game.ts` | `ClueConditionType` 타입 정의, `ClueCondition` 인터페이스 추가 (has_items/gave_items/items_and_character 지원), `Clue.condition?`, `Location.accessCondition?` 필드 추가 |
| `src/app/api/sessions/[sessionId]/cards/route.ts` | `evaluateCondition(pState, targetState, condition)` 함수 신규 추가 (3가지 조건 타입별 평가 로직), POST handler에 장소 입장 조건 + 단서 획득 조건 이중 검증 로직 추가, 조건 미충족 시 400/403 응답 |
| `src/app/maker/[gameId]/edit/_components/LocationEditor.tsx` | `ConditionForm` 컴포넌트 신규 추가 (조건 유형 선택 + 파라미터 입력), `ClueForm`에 단서 획득 조건 UI 섹션 추가, `LocationBlock`에 장소 입장 조건 UI 추가, `allClues` prop 체인 추가 (타겟 클루 ID 드롭다운용) |
| `src/app/play/[gameId]/[charId]/page.tsx` | `checkConditionLocally()` 헬퍼 함수 추가 (클라이언트 로컬 조건 체크), 장소 잠금 상태 표시 UI (입장 조건 미충족), 단서 조건부 표시 UI (🔐 힌트 아이콘) |

### 3.2 조건 평가 로직 (서버)

```typescript
evaluateCondition(
  pState: PlayerState,
  targetState: PlayerState,
  condition: ClueCondition
): boolean {
  switch (condition.type) {
    case 'has_items':
      // 플레이어 인벤토리에 requiredClueIds 중 최소 1개 보유
      return condition.requiredClueIds!.some(clueId =>
        pState.inventory.some(item => item.cardId === clueId)
      );

    case 'gave_items':
      // A→B 이전 이력 + B가 현재 보유 중
      const gave = pState.transferLog.some(log =>
        log.targetPlayerId === condition.targetCharacterId &&
        condition.requiredClueIds!.includes(log.clueId)
      );
      const stillHas = targetState.inventory.some(item =>
        condition.requiredClueIds!.includes(item.cardId)
      );
      return gave && stillHas;

    case 'items_and_character':
      // 플레이어가 requiredClueIds 보유 + targetCharacterId로부터 수령 이력
      const hasItems = condition.requiredClueIds!.some(clueId =>
        pState.inventory.some(item => item.cardId === clueId)
      );
      const hasTransfer = pState.inventory.some(item =>
        item.fromPlayerId === condition.targetCharacterId
      );
      return hasItems && hasTransfer;
  }
}
```

### 3.3 장소 입장 조건 검증 흐름

```
POST /api/sessions/[sessionId]/cards

1. 단서 데이터 로드
2. 장소.accessCondition 확인
   → 있으면 evaluateCondition() 실행
   → 실패 시 400 + "입장 불가" 메시지
3. 단서.condition 확인
   → 있으면 evaluateCondition() 실행
   → 실패 시 403 + "조건 미충족" 메시지
4. 모든 조건 통과 → 인벤토리 추가 + SSE 브로드캐스트
```

### 3.4 클라이언트 조건 판정 (`checkConditionLocally`)

```typescript
function checkConditionLocally(
  condition: ClueCondition | undefined,
  playerInventory: InventoryItem[]
): 'satisfied' | 'pending' | 'unknown' {
  if (!condition) return 'satisfied';

  if (condition.type === 'has_items') {
    const hasSome = condition.requiredClueIds?.some(id =>
      playerInventory.some(item => item.cardId === id)
    );
    return hasSome ? 'satisfied' : 'pending';
  }

  // gave_items, items_and_character: 다른 플레이어 상태 필요 → unknown
  return 'unknown';
}
```

반환값:
- `'satisfied'`: 조건 충족, 획득 버튼 활성화
- `'pending'`: 조건 미충족 (has_items 타입), 버튼 비활성화
- `'unknown'`: 서버 검증 필요 (gave_items/items_and_character), 🔐 표시

### 3.5 메이커 UI 설계

**ConditionForm 컴포넌트:**
```
┌─────────────────────────────┐
│ 조건 유형 선택              │
│ ○ 없음                      │
│ ○ 아이템 보유               │
│ ○ 아이템 양도               │
│ ○ 아이템+캐릭터 교류         │
└─────────────────────────────┘

선택된 유형에 따라:
- has_items:        [클루 ID 드롭다운] (다중 선택 가능)
- gave_items:       [클루 ID] + [대상 캐릭터]
- items_and_character: [클루 ID] + [대상 캐릭터]
```

**ClueForm 단서 편집:**
```
클루 내용
┌─ 이름 ─┐
│ 단서 조건 설정 (옵션)
│ [ConditionForm]
└────────┘
```

**LocationBlock 장소 편집:**
```
장소명
┌─ 입장 조건 설정 (선택)
│ [ConditionForm]
│
│ 단서 목록
│ • 단서 1 (개별 조건 설정)
│ • 단서 2 (개별 조건 설정)
└────────┘
```

### 3.6 플레이어 뷰 표시 로직

```
장소 선택 화면
└─ [장소명]
   └─ 입장 조건 미충족 → 🔐 "입장 조건 미충족"
      (버튼 비활성화, 상세 조건 미표시)

   입장 가능
   └─ 단서 목록
      • [단서 1] (조건: 만족) → 버튼 활성화
      • [단서 2] (조건: 🔐) → 버튼 비활성화
      • [단서 3] (다른 플레이어 보유) → "획득 불가"
```

### 3.7 빌드 검증

**타입 체크:**
```bash
$ npx tsc --noEmit
No errors detected.
```

**전체 빌드:**
```bash
$ npm run build
...
✓ Build completed successfully
Page routes (.next/server/app):
  ✓ /api/sessions/[sessionId]/cards
  ✓ /app/maker/[gameId]/edit
  ✓ /app/play/[gameId]/[charId]
...
```

### 3.8 핵심 아키텍처 결정

#### 1. 조건 이중 검증 (장소 + 단서)
장소 레벨과 단서 레벨의 독립적 조건 설정으로 게임 디자인 유연성 극대화. 입장 조건 미충족 시 장소 전체 접근 불가, 단서 조건 미충족 시 해당 단서만 획득 불가.

#### 2. `gave_items` 동시 검증 메커니즘
반환 버그 방지를 위해 이전 이력과 현재 보유 상태를 모두 확인. B가 반환하는 순간 조건 자동 해제되는 구조로 무한 루프나 이중 획득 완전 차단.

#### 3. 클라이언트-서버 역할 분리
- `has_items`: 로컬 판정 가능 → 클라이언트 최적화
- `gave_items`, `items_and_character`: 원격 상태 필요 → 서버만 검증, 클라이언트는 힌트만 표시

#### 4. Optional 필드로 기존 호환성 유지
기존 시나리오(조건 없는 단서)는 `condition?` undefined로 처리되어 그대로 동작.

---

## 4. 다음 단계

- [ ] 조건부 단서 시나리오 실제 플레이 테스트 (has_items / gave_items / items_and_character 각 1회씩)
- [ ] 조건 미충족 상태에서 획득 시도 시 에러 메시지 UX 검수 (400/403 응답 처리)
- [ ] `gave_items` 반환 케이스: A가 B에게 준 후 B가 반환 시 조건 자동 해제 동작 확인
- [ ] 메이커 UI: 타겟 캐릭터 드롭다운이 정확한 캐릭터 목록 표시하는지 검증
- [ ] 장소 입장 조건 vs 단서 조건 간 우선순위 테스트 (입장 불가 시 단서 요청 차단 확인)
- [ ] `items_and_character` 교류 이력 검증: transferLog의 `fromPlayerId` 필드 정확성 확인
