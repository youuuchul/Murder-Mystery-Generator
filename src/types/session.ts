// ─── 게임 세션 타입 정의 ──────────────────────────────────────

export type GamePhase =
  | "lobby"
  | "opening"
  | `round-${number}`
  | "vote"
  | "ending";

/** 캐릭터 슬롯 — 게임의 Player 1개에 대응 */
export interface CharacterSlot {
  playerId: string;          // GamePackage.players[].id
  playerName: string | null; // 실제 참여자 이름
  token: string | null;      // 참여자 인증 토큰 (localStorage)
  isLocked: boolean;         // 슬롯 점유 여부
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

export interface VoteReveal {
  tally: VoteTally[];
  culpritPlayerId: string; // 진짜 범인 (game.story.culpritPlayerId)
  majorityCorrect: boolean; // 과반수 이상이 진범에게 투표했는지
}

/** 세션 공개 상태 — 모든 참여자에게 브로드캐스트 */
export interface SharedState {
  phase: GamePhase;
  currentRound: number;
  publicClueIds: string[];
  /** 누군가 보유 중인 단서 ID 목록 — 장소에서 중복 획득 방지용 */
  acquiredClueIds: string[];
  eventLog: EventLogEntry[];
  characterSlots: CharacterSlot[];
  voteCount: number;
  voteReveal?: VoteReveal;
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
  sessionCode: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  sharedState: SharedState;
  playerStates: PlayerState[];
  votes: Record<string, string>; // token → targetPlayerId (비공개, 서버 전용)
}
