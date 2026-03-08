# 피드백 반영 데이터 모델 리팩토링 — 작업 보고서

- 날짜: 2026-03-08
- 소요 세션: 1회
- 담당: Claude Sonnet 4.6

---

## 1. User Prompt

사용자 피드백 세 가지:
1. 범인 ID 복사 불편 → 범인을 플레이어 드롭다운으로 선택
2. 피해자는 플레이어 슬롯이 아님 → Story.victim 별도 섹션
3. 증거카드는 라운드 공개가 아닌 장소 기반 획득 방식

추가 피드백:
- 각 캐릭터는 자기 단서를 직접 얻지 못함 (자기 방/공간은 접근 불가)
- 캐릭터 → 플레이어로 용어 통일
- 역할(범인/형사) → 승리조건(검거회피/검거/개인목표)으로 교체
- 미션별 승점 조건 추가
- 소지품 안내 대신 단서 카드 선택 + 관련 설명

---

## 2. Thinking Process

**핵심 설계 결정:**

| 결정 | 이유 |
|------|------|
| Clue.revealAtRound 제거 → Clue.locationId | 단서는 라운드가 아닌 장소에 귀속 |
| Location.ownerPlayerId 추가 | 소유자는 자기 공간 접근 불가 |
| characters[] → players[] | 용어 일관성, 피해자 분리 |
| Story.victim: VictimInfo 별도 필드 | 피해자는 플레이어 슬롯을 차지하지 않음 |
| VictoryCondition 타입 신설 | 역할 대신 목표 기반 설계 |
| ScoreCondition[] per player | 캐릭터별 유연한 승점 설정 |
| RelatedClueRef[] | 자기 관련 단서를 드롭다운으로 선택, 메모 첨부 |
| Story.culpritPlayerId | 범인을 플레이어 목록 드롭다운으로 선택 |

**삭제된 컴포넌트:**
- `ClueEditor.tsx` — 라운드 기반 설계 전제, 장소 기반으로 교체되어 삭제
- `CharacterEditor.tsx` → `PlayerEditor.tsx`로 완전 대체

---

## 3. Execution Result

### 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/types/game.ts` | `characters[]` → `players[]`, `VictoryCondition`, `ScoreCondition`, `RelatedClueRef`, `Relationship`, `Location.ownerPlayerId`, `Clue.locationId`, `Story.victim: VictimInfo`, `Story.culpritPlayerId`, `GameRules.phases` |
| `src/app/api/games/route.ts` | `players: []` 초기화, `story.victim` 초기화, `buildDefaultRules()` 추가 |
| `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx` | `game.characters` → `game.players` |
| `src/app/maker/[gameId]/edit/_components/StoryEditor.tsx` | 피해자 섹션, 시놉시스, 범인 드롭다운 추가 |
| `src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx` | CharacterEditor 대체. 승리조건(4가지), 승점 탭, 연관단서 탭, 관계 탭 |
| `src/app/maker/[gameId]/edit/_components/LocationEditor.tsx` | 장소+단서 통합 편집기. ownerPlayerId 드롭다운 |
| `src/app/maker/[gameId]/edit/_components/ScriptEditor.tsx` | `unlockedLocationIds` 사용 |
| `src/app/library/_components/GameCard.tsx` | `game.playerCount` (characterCount 제거) |
| `src/lib/storage/game-storage.ts` | metadata `playerCount` 필드 |

### 추가 UI 수정 (레이아웃 정렬)

| 파일 | 수정 |
|------|------|
| `StepWizard.tsx` | Step 3 레이블 "인물" → "플레이어", 커넥터 라인 `mt-4` → `mt-7` |
| `PlayerEditor.tsx` | 탭 버튼 `px-1` → `px-2 whitespace-nowrap overflow-hidden text-ellipsis` |

### 타입 구조 요약 (최종)

```typescript
VictoryCondition = "avoid-arrest" | "uncertain" | "arrest-culprit" | "personal-goal"

Player {
  victoryCondition: VictoryCondition
  scoreConditions: ScoreCondition[]
  relatedClues: RelatedClueRef[]
  relationships: Relationship[]
}

Story {
  synopsis: string          // 메이커 전용 전체 플롯
  victim: VictimInfo        // 피해자 별도 섹션
  culpritPlayerId: string   // 플레이어 드롭다운 선택
}

Location {
  ownerPlayerId?: string    // 접근 불가 캐릭터
  clueIds: string[]
}

Clue {
  locationId: string        // 장소 귀속 (revealAtRound 제거)
  isSecret: boolean         // GM 직접 배포 여부
}
```

## 4. 다음 단계

- [ ] Phase 2: SQLite 세션 시스템 설계
- [ ] `/play/[gameId]` — GM 뷰 (게임 진행 제어)
- [ ] `/join/[sessionCode]` — 플레이어 입장
- [ ] SSE 실시간 카드 획득·이전 알림
