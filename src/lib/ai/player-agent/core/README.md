# Player Agent Core

AI 플레이어의 상태 모델을 관리한다.

## `player-agent-state.ts`

- `initializePlayerAgentState()`: 세션 생성 시 AI 슬롯 초기화
- `enablePlayerAgentSlotsForMissingPlayers()`: 대기실→오프닝 전환 시 빈 슬롯 AI 채우기
- `applyPlayerAgentOccupancyToCharacterSlots()`: AI 상태를 characterSlots에 동기화
- `getPlayerAgentRuntimeStatusLabel()`: 런타임 상태 한국어 라벨

### 런타임 상태

| 상태 | 라벨 | 설명 |
|------|------|------|
| `idle` | 대기 | 행동 없음 |
| `thinking` | 추론 중 | 다음 행동 결정 중 |
| `acting` | 행동 중 | 단서 획득/투표 실행 |
| `responding` | 응답 중 | 채팅 응답 생성 중 |
| `cooldown` | 정리 중 | 행동 후 대기 |
