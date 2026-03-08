// ─── 게임 패키지 최상위 ──────────────────────────────────────

export interface GamePackage {
  id: string; // UUID
  title: string;
  createdAt: string; // ISO 8601
  updatedAt: string;

  settings: GameSettings;
  rules: GameRules;
  story: Story;
  players: Player[]; // 플레이어 캐릭터 (피해자 제외)
  locations: Location[];
  clues: Clue[];
  cards: CardSet;
  scripts: Scripts;
}

// ─── 설정 ────────────────────────────────────────────────────

export interface GameSettings {
  playerCount: number; // 4~8
  difficulty: "easy" | "normal" | "hard";
  theme: string;
  tone: "serious" | "comedy" | "horror";
  estimatedDuration: number; // 분 단위
}

export interface PhaseConfig {
  type: "investigation" | "briefing" | "discussion";
  label: string;
  durationMinutes: number;
}

export interface GameRules {
  roundCount: number;
  phases: PhaseConfig[];
  privateChat: {
    enabled: boolean;
    maxGroupSize: number;
    durationMinutes: number;
  };
  cardTrading: {
    enabled: boolean;
  };
  cluesPerRound: number;         // 라운드당 최대 획득 단서 수 (0 = 무제한)
  allowLocationRevisit: boolean; // 같은 라운드에 같은 장소 재방문 허용
}

// ─── 스토리 ──────────────────────────────────────────────────

export interface TimelineEvent {
  time: string;
  description: string;
}

/** 피해자 정보 — 사건 개요에서 작성, 게임 시작 시 전원 공개 */
export interface VictimInfo {
  name: string;
  background: string; // 피해자 배경 (공개)
  deathCircumstances: string; // 사망 경위 (공개)
}

export interface Story {
  synopsis: string; // 메이커 전용 — 전체 진실 메모
  victim: VictimInfo;
  incident: string; // 플레이어 공개 사건 설명
  location: string; // 배경 장소
  timeline: TimelineEvent[];
  culpritPlayerId: string; // GM only — 진짜 범인 player ID
  motive: string; // GM only
  method: string; // GM only
}

// ─── 플레이어 캐릭터 ─────────────────────────────────────────

/**
 * 승리 조건 (플레이어 카드에 표기)
 * avoid-arrest    : 범인 — 검거 회피
 * uncertain       : 범인 여부 미확정 — 검거 or 회피
 * arrest-culprit  : 무고 — 범인 검거
 * personal-goal   : 개인 목표 (아이템 획득, 범인 보호 등)
 */
export type VictoryCondition =
  | "avoid-arrest"
  | "uncertain"
  | "arrest-culprit"
  | "personal-goal";

export const VICTORY_CONDITION_LABELS: Record<VictoryCondition, string> = {
  "avoid-arrest": "검거 회피 (범인)",
  "uncertain": "검거 or 회피 (미확정)",
  "arrest-culprit": "범인 검거 (무고)",
  "personal-goal": "개인 목표",
};

/** 승점 조건 1개 */
export interface ScoreCondition {
  description: string; // 예: "범인 검거 성공", "목표 아이템 획득"
  points: number;
}

/** 연관 단서 정보 — 플레이어 카드에 표기. 자기 관련 단서가 어떤 것인지 알려줌 */
export interface RelatedClueRef {
  clueId: string;
  note: string; // 이 단서와의 관계 설명 (예: "당신의 방에 보관된 물건이지만 접근할 수 없습니다")
}

export interface Relationship {
  playerId: string;
  description: string;
}

export interface Player {
  id: string;
  name: string; // 캐릭터 이름
  victoryCondition: VictoryCondition;
  personalGoal?: string; // victoryCondition === "personal-goal"일 때 목표 설명
  scoreConditions: ScoreCondition[]; // 승점 조건 목록
  background: string; // 캐릭터 배경 (전원 공개)
  secret: string; // 본인만 열람
  alibi: string;
  relatedClues: RelatedClueRef[]; // 연관 단서 카드 + 설명
  relationships: Relationship[];
  cardImage?: string;
}

// ─── 장소 & 단서 ─────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  description: string;
  unlocksAtRound: number | null;
  clueIds: string[];
  ownerPlayerId?: string; // 이 장소 소유자 — 해당 플레이어는 접근 불가
}

export interface Clue {
  id: string;
  title: string;
  description: string;
  type: "physical" | "testimony" | "document" | "scene";
  locationId: string;
  pointsTo?: string; // GM 메모
  isSecret?: boolean; // GM 직접 배포용
}

// ─── 카드셋 ──────────────────────────────────────────────────

export interface CharacterCard {
  playerId: string;
  frontText: string;
  backText: string;
}

export interface ClueCard {
  clueId: string;
  title: string;
  description: string;
  type: Clue["type"];
}

export interface EventCard {
  round: number;
  title: string;
  description: string;
  unlockedLocationIds: string[];
}

export interface CardSet {
  characterCards: CharacterCard[];
  clueCards: ClueCard[];
  eventCards: EventCard[];
}

// ─── 스크립트 ─────────────────────────────────────────────────

export interface ScriptSegment {
  narration: string;
  videoUrl?: string;
  backgroundMusic?: string;
}

export interface RoundScript {
  round: number;
  narration: string;
  unlockedLocationIds: string[];
}

export interface Scripts {
  opening: ScriptSegment;
  rounds: RoundScript[];
  ending: ScriptSegment;          // 공통 (빈 경우 분기별로 표시)
  endingSuccess?: ScriptSegment;  // 범인 검거 성공 엔딩
  endingFail?: ScriptSegment;     // 범인 도주 성공 엔딩
}

// ─── 메타데이터 ──────────────────────────────────────────────

export interface GameMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  settings: Pick<GameSettings, "playerCount" | "difficulty" | "theme" | "tone" | "estimatedDuration">;
  playerCount: number;
  clueCount: number;
  locationCount: number;
}
