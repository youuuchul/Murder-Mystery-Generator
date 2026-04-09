export type GameVisibility = "draft" | "private" | "unlisted" | "public";

export interface GameAccessMeta {
  ownerId: string;
  visibility: GameVisibility;
  publishedAt?: string;
}

// ─── 게임 패키지 최상위 ──────────────────────────────────────

export interface GamePackage {
  id: string; // UUID
  title: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  access: GameAccessMeta;

  settings: GameSettings;
  rules: GameRules;
  story: Story;
  players: Player[]; // 플레이어 캐릭터 (피해자 제외)
  locations: Location[];
  clues: Clue[];
  cards: CardSet;
  scripts: Scripts;
  ending: EndingConfig;
}

// ─── 설정 ────────────────────────────────────────────────────

export interface GameSettings {
  playerCount: number; // 1~8
  difficulty: "easy" | "normal" | "hard";
  tags: string[];
  summary?: string; // 라이브러리 카드에 노출할 소개글
  coverImageUrl?: string;
  coverImagePosition?: CoverImagePosition;
  /** legacy field — 기존 데이터 호환용 */
  theme?: string;
  /** legacy field — 기존 데이터 호환용 */
  tone?: "serious" | "comedy" | "horror";
  estimatedDuration: number; // 분 단위
}

export interface CoverImagePosition {
  x: number;
  y: number;
}

export interface PhaseConfig {
  type: "investigation" | "discussion";
  label: string;
  durationMinutes: number;
}

export interface GameRules {
  roundCount: number;
  openingDurationMinutes: number;
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

// ─── 스토리 & 타임라인 ───────────────────────────────────────

/** legacy field — 기존 사건 타임라인 데이터 호환용 */
export interface TimelineEvent {
  time: string;
  description: string;
}

export interface TimelineSlot {
  id: string;
  label: string;
}

export interface StoryTimeline {
  enabled: boolean;
  slots: TimelineSlot[];
}

/** 피해자 정보 — 사건 개요에서 작성, 게임 시작 시 전원 공개 */
export interface VictimInfo {
  name: string;
  background: string; // 피해자 배경 (공개)
  imageUrl?: string;
  /** legacy field — 기존 데이터 호환용 */
  deathCircumstances?: string;
}

/** 공개 인물(NPC) 정보 — 플레이어 화면 인물 정보 탭에 노출 */
export interface StoryNpc {
  id: string;
  name: string;
  background: string;
  imageUrl?: string;
}

export interface Story {
  synopsis: string; // 메이커 전용 — 전체 진실 메모
  victim: VictimInfo;
  npcs: StoryNpc[];
  incident: string; // 플레이어 공개 사건 설명
  /** legacy field — 기존 데이터 호환용 */
  location?: string;
  gmOverview?: string; // GM 메인 화면 공통 메모
  mapImageUrl?: string; // GM 메인 화면 공통 지도/이미지
  timeline: StoryTimeline;
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

export type RelationshipTargetType = "player" | "victim" | "npc";

export interface Relationship {
  targetType: RelationshipTargetType;
  targetId: string;
  description: string;
  /** legacy field — 기존 데이터 호환용 */
  playerId?: string;
}

export interface PlayerTimelineEntry {
  slotId: string;
  action: string;
}

export interface Player {
  id: string;
  name: string; // 캐릭터 이름
  victoryCondition: VictoryCondition;
  personalGoal?: string; // victoryCondition === "personal-goal"일 때 목표 설명
  scoreConditions: ScoreCondition[]; // 승점 조건 목록
  background: string; // 캐릭터 배경 (전원 공개)
  story: string; // 캐릭터 상세 스토리 (본인만 열람)
  secret: string; // 비밀 / 반전 정보 (본인만 열람)
  /** legacy field — 기존 데이터 호환용 */
  alibi?: string;
  timelineEntries: PlayerTimelineEntry[]; // 슬롯별 행동 타임라인
  relatedClues: RelatedClueRef[]; // 연관 단서 카드 + 설명
  relationships: Relationship[];
  cardImage?: string;
}

// ─── 단서/장소 획득 조건 ──────────────────────────────────────

/**
 * has_items           : 요청 플레이어가 지정 단서를 현재 인벤토리에 보유
 * character_has_item  : 특정 캐릭터가 지정 단서를 현재 인벤토리에 보유
 *
 * 두 타입 모두 현재 인벤토리 상태를 동적으로 체크하므로
 * 아이템 반환 시 조건이 자동으로 해제됨
 */
export type ClueConditionType = "has_items" | "character_has_item";

export interface ClueCondition {
  type: ClueConditionType;
  requiredClueIds: string[];   // 필요한 단서/아이템 ID 목록
  targetCharacterId?: string;  // character_has_item: 아이템을 보유해야 할 캐릭터 ID
  hint?: string;               // 잠금 상태일 때 플레이어에게 보여줄 힌트
}

// ─── 장소 & 단서 ─────────────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;            // 장소 대표 이미지
  unlocksAtRound: number | null;
  clueIds: string[];
  ownerPlayerId?: string;         // 이 장소 소유자 — 해당 플레이어는 접근 불가
  accessCondition?: ClueCondition; // 입장 조건 (없으면 자유 입장)
}

export interface Clue {
  id: string;
  title: string;
  description: string;
  type: "physical" | "testimony" | "scene";
  imageUrl?: string;          // 플레이어 인벤토리/상세에 노출할 단서 이미지
  locationId: string;
  /** legacy field — 기존 데이터 호환용 */
  pointsTo?: string;
  /** legacy field — 기존 데이터 호환용 */
  isSecret?: boolean;
  condition?: ClueCondition;   // 획득 조건 (없으면 자유 획득)
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
  imageUrl?: string;
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
  gmNote?: string; // 해당 페이즈의 GM 메인 화면 메모
}

export interface RoundScript {
  round: number;
  narration: string;
  unlockedLocationIds: string[];
  imageUrl?: string;
  videoUrl?: string;
  backgroundMusic?: string;
  gmNote?: string; // 해당 라운드의 GM 메인 화면 메모
}

export interface Scripts {
  lobby: ScriptSegment;
  opening: ScriptSegment;
  rounds: RoundScript[];
  vote: ScriptSegment;
  ending: ScriptSegment;          // 공통 (빈 경우 분기별로 표시)
  endingSuccess?: ScriptSegment;  // 범인 검거 성공 엔딩
  endingFail?: ScriptSegment;     // 범인 도주 성공 엔딩
}

export type EndingBranchTriggerType =
  | "culprit-captured"
  | "specific-player-arrested"
  | "wrong-arrest-fallback";

export interface EndingBranch {
  id: string;
  label: string;
  triggerType: EndingBranchTriggerType;
  targetPlayerId?: string;
  storyText: string;
  personalEndingsEnabled?: boolean;
  personalEndings?: PersonalEnding[];
  videoUrl?: string;
  backgroundMusic?: string;
}

export interface PersonalEnding {
  playerId: string;
  title?: string;
  text: string;
}

export interface AuthorNote {
  id: string;
  title: string;
  content: string;
}

export interface EndingConfig {
  branches: EndingBranch[];
  /** legacy field — 기존 공통 개인 엔딩 데이터 호환용 */
  personalEndingsEnabled: boolean;
  /** legacy field — 기존 공통 개인 엔딩 데이터 호환용 */
  personalEndings: PersonalEnding[];
  authorNotesEnabled: boolean;
  authorNotes: AuthorNote[];
}

// ─── 메타데이터 ──────────────────────────────────────────────

export interface GamePublishChecklistItem {
  id: "title" | "summary" | "players" | "opening" | "ending";
  label: string;
  passed: boolean;
  detail: string;
}

export interface GamePublishReadiness {
  ready: boolean;
  checklist: GamePublishChecklistItem[];
}

export interface GameMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  access: GameAccessMeta;
  settings: Pick<GameSettings, "playerCount" | "difficulty" | "tags" | "estimatedDuration" | "coverImageUrl" | "coverImagePosition" | "summary">;
  playerCount: number;
  clueCount: number;
  locationCount: number;
  publishReadiness: GamePublishReadiness;
}
