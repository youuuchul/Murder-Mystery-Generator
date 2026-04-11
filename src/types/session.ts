// ─── 게임 세션 타입 정의 ──────────────────────────────────────

export type GamePhase =
  | "lobby"
  | "opening"
  | `round-${number}`
  | "vote"
  | "ending";

/**
 * 세션 진행 방식.
 * `gm` 은 기존처럼 GM 대시보드가 있는 방이고,
 * `player-consensus` 는 플레이어 합의로만 다음 단계가 넘어가는 GM 없는 방이다.
 */
export type SessionMode = "gm" | "player-consensus";

export type PlayerAgentRuntimeStatus = "idle" | "thinking" | "responding" | "acting" | "cooldown";

export interface PlayerAgentActionState {
  lastClueAcquiredAt?: string;
  lastVoteSubmittedAt?: string;
  lastTradeDecisionAt?: string;
  deferredReason?: string;
}

export interface PlayerAgentConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface PlayerAgentSlotState {
  playerId: string;
  enabled: boolean;
  runtimeStatus: PlayerAgentRuntimeStatus;
  conversationHistory: PlayerAgentConversationTurn[];
  knownCardIds: string[];
  actionState: PlayerAgentActionState;
}

export interface PlayerAgentSessionState {
  sessionId: string;
  sessionMode: SessionMode;
  slots: PlayerAgentSlotState[];
}

/** 캐릭터 슬롯 — 게임의 Player 1개에 대응 */
export interface CharacterSlot {
  playerId: string;          // GamePackage.players[].id
  playerName: string | null; // 실제 참여자 이름
  token: string | null;      // 참여자 인증 토큰 (localStorage)
  isLocked: boolean;         // 슬롯 점유 여부
  isAiControlled?: boolean;  // AI 플레이어가 맡고 있는 슬롯인지 여부
  aiRuntimeStatus?: PlayerAgentRuntimeStatus; // AI 슬롯의 현재 동작 상태
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  message: string;
  type:
    | "card_received"
    | "card_transferred"
    | "phase_changed"
    | "clue_revealed"
    | "player_joined"
    | "vote_submitted"
    | "vote_revealed"
    | "system";
}

// ─── 투표 ─────────────────────────────────────────────────────

export interface VoteTally {
  playerId: string;     // 득표한 캐릭터 ID
  count: number;
  voterNames: string[]; // 투표한 실제 참여자 이름 목록
}

export type EndingStage = "branch" | "vote-round-2" | "branch-2" | "personal" | "author-notes" | "complete";

/** 질문별 투표 집계 결과 (고급 투표 모드) */
export interface QuestionTally {
  questionId: string;
  tally: VoteTally[];
}

export interface VoteReveal {
  tally: VoteTally[];
  culpritPlayerId: string; // 진짜 범인 (game.story.culpritPlayerId)
  /** 현재 공개된 최종 검거 대상 캐릭터 ID */
  arrestedPlayerId?: string;
  /** 엔딩 분기 판정 결과 */
  resultType?: "culprit-captured" | "wrong-arrest";
  /** 적용된 엔딩 브랜치 ID */
  resolvedBranchId?: string;
  /** legacy field — 기존 데이터 호환용 */
  majorityCorrect?: boolean;
  /** 고급 투표: 투표 라운드 번호 */
  voteRound?: number;
  /** 고급 투표: 질문별 집계 결과 */
  questionTallies?: QuestionTally[];
}

/** GM/호스트가 시작한 서버 기반 타이머 상태 */
export interface TimerState {
  startedAt: string;
  durationSeconds: number;
  pausedRemaining?: number;
  label: string;
}

/** 세션 공개 상태 — 모든 참여자에게 브로드캐스트 */
export interface SharedState {
  phase: GamePhase;
  /** 현재 메인 페이즈가 시작된 시각. 오프닝 제한시간 계산에 사용한다. */
  phaseStartedAt?: string;
  /** GM/호스트가 명시적으로 시작한 라운드 타이머. 일시정지/재시작 지원. */
  timerState?: TimerState;
  currentRound: number;
  /** 현재 라운드의 서브 페이즈 — round-N 페이즈에서만 유효 */
  currentSubPhase?: "investigation" | "discussion";
  publicClueIds: string[];
  /** 누군가 보유 중인 단서 ID 목록 — 장소에서 중복 획득 방지용 */
  acquiredClueIds: string[];
  eventLog: EventLogEntry[];
  characterSlots: CharacterSlot[];
  /** 다음 단계 진행 요청을 누른 플레이어 ID 목록 */
  phaseAdvanceRequestPlayerIds: string[];
  voteCount: number;
  /** 현재 투표 라운드 (고급 투표 모드). 기본값 1. */
  currentVoteRound?: number;
  endingStage?: EndingStage;
  voteReveal?: VoteReveal;
  /** 이전 투표 라운드 결과 (2차 투표 시 1차 결과 보존) */
  previousVoteReveals?: VoteReveal[];
}

/** 인벤토리에 보유한 단서 카드 1장 */
export interface InventoryCard {
  cardId: string;           // Clue.id
  cardType: "clue";
  acquiredAt: string;
  fromPlayerId?: string;    // 카드 이전받은 경우 상대 playerId
}

export interface TransferLogEntry {
  id: string;
  fromToken: string;
  toToken: string;
  cardId: string;
  timestamp: string;
}

/** 플레이어 개인 상태 — token으로만 접근 가능 */
export interface PlayerState {
  token: string;
  playerId: string;
  playerName: string;
  inventory: InventoryCard[];
  transferLog: TransferLogEntry[];
  /** 라운드 → 해당 라운드에 획득한 단서 수 */
  roundAcquired: Record<string, number>;
  /** 라운드 → 해당 라운드에 방문한 locationId 목록 */
  roundVisitedLocations: Record<string, string[]>;
}

export interface GameSession {
  id: string;
  gameId: string;
  sessionName: string;
  sessionCode: string;
  mode: SessionMode;
  /** 이 세션을 만든 GM 작업자 ID. 공개 게임의 익명 GM 세션은 비어 있을 수 있다. */
  hostUserId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  /** GM 전용 — 최다 득표 동률 시 최종 검거 대상을 선택해야 하는 후보 목록 */
  pendingArrestOptions?: string[];
  sharedState: SharedState;
  playerStates: PlayerState[];
  votes: Record<string, string>; // token → targetPlayerId (비공개, 서버 전용, 기본 투표)
  /** 고급 투표: token → questionId → targetId */
  advancedVotes?: Record<string, Record<string, string>>;
  /** AI 플레이어 내부 상태 — 세션 저장에는 포함되지만 플레이어 응답에는 직접 노출하지 않는다. */
  playerAgentState?: PlayerAgentSessionState;
}

/** 세션 목록/선택 UI에서 사용하는 경량 요약 정보 */
export interface GameSessionSummary {
  id: string;
  sessionName: string;
  mode: SessionMode;
  createdAt: string;
  startedAt?: string;
  phase: GamePhase;
  currentRound: number;
  currentSubPhase?: SharedState["currentSubPhase"];
  lockedPlayerCount: number;
  totalPlayerCount: number;
  /** 현재 브라우저/작업자 기준으로 코드 없이 바로 열 수 있는 세션인지 여부. */
  canResumeDirectly: boolean;
}
