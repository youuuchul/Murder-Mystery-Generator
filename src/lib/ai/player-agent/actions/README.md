# Player Agent Actions

AI 플레이어의 자동 행동을 규칙 기반으로 처리한다. LLM을 사용하지 않는다.

## `auto-actions.ts`

### 자동 단서 획득 (`applyPlayerAgentAutoAcquireReaction`)

- 트리거: `human_clue_acquired`, `gm_advance_phase`, `phase_request_advance`
- 1회 트리거에 모든 AI 플레이어가 각각 1개씩 획득 (호출 측에서 루프)
- 선택 규칙: 씬 단서 제외, 중복 제외, 라운드 잠금, 조건식, 장소 재방문 제약
- 결정론적: `sessionId:playerId:roundKey:clueCount` 해시로 재현 가능

### 자동 투표 (`applyPlayerAgentAutoVotes`)

- 로직 구현됨, 호출 미연결 (투표 API에서 아직 사용 안 함)
- 점수 기반: 보유 단서가 가리키는 대상 +3점, 해시 tiebreaker
- AI 투표는 기본 비활성화 (엔딩 투표는 사람만 집계)

### Langfuse 트레이싱

- `tracePlayerAgentAutoVoteOutcome()`: 투표 결과 trace (`player-agent.auto-vote`)
- 자동 단서 획득은 결정론 로직이라 트레이스를 남기지 않는다 (응답 지연 회피).
