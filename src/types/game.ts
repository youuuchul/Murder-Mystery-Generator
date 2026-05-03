export type GameVisibility = "private" | "unlisted" | "public";

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

  advancedVotingEnabled: boolean;
  voteQuestions: VoteQuestion[];
}

// ─── 설정 ────────────────────────────────────────────────────

export interface GameSettings {
  playerCount: number; // 1~15
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
  zoom?: number;
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
  /**
   * 게임 단위 점수 시스템 사용 여부 (default true).
   * false면 메이커 [승점] 탭이 비활성, 결과 화면 점수 표시 X, 점수 평가 자체 skip.
   * 승점 없이 승리조건(범인/무고 라벨)만 있는 게임을 표현.
   */
  scoringEnabled?: boolean;
  /**
   * 라운드별 이벤트(나레이션·이미지·BGM·영상) 사용 여부 (default false).
   * false면 미디어/이벤트 탭에서 라운드 카드 그룹이 접혀 있고, 라이브에서도 게임 단위 기본 지도/BGM만 사용.
   * true면 라운드 카드별 enabled 토글로 라운드별 입력 펼침/접힘 제어.
   */
  useRoundEvents?: boolean;
  /**
   * 대기실 안내(나레이션·BGM) 사용 여부 (default false).
   * true면 미디어/이벤트 탭에서 대기실 입력 펼침. game.scripts.lobby에 저장.
   */
  useLobbyScript?: boolean;
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
  /** 게임 단위 기본 BGM URL — 라운드별 BGM이 없거나 라운드 이벤트가 off일 때 사용. */
  defaultBackgroundMusic?: string;
  timeline: StoryTimeline;
  /**
   * GM only — 진짜 범인의 식별자.
   * 단일 문자열이지만 의미가 셋:
   *  - 플레이어가 범인: `player.id`
   *  - 피해자가 범인: 고정 문자열 `"victim"`  (`@/lib/culprit#CULPRIT_VICTIM_ID`)
   *  - NPC 가 범인: `npc.id`
   * 직접 문자열 비교 대신 `@/lib/culprit` 의 헬퍼(`resolveCulpritIdentity`, `isCulpritIdValid`)를 쓴다.
   */
  culpritPlayerId: string;
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

/** 승점 조건 자동 판정 타입 */
export type ScoreConditionType =
  | "manual"                       // 수동 판정 (설명만 표시)
  | "culprit-outcome"              // 범인 검거 결과 (arrested/escaped) — auto 모드 캐릭터의 기본 점수
  | "vote-answer"                  // 추가 투표 답변 일치 여부
  | "target-player-not-arrested"   // 개인 목표 — 특정 플레이어가 검거되지 않으면 (케이스 A)
  | "target-player-arrested"       // 개인 목표 — 특정 플레이어가 검거되면 (범인 유무 무관, 케이스 C)
  | "clue-collection";             // 개인 목표 — 특정 단서 수집 (케이스 D, all / at-least-n / per-clue 모드)

/** 자동 판정 조건의 세부 설정 */
export interface ScoreConditionConfig {
  /** culprit-outcome: "arrested"=범인이 검거됨, "escaped"=범인이 도주함 */
  expectedOutcome?: "arrested" | "escaped";
  /** vote-answer: 대상 투표 질문 ID (purpose="personal" 질문) */
  questionId?: string;
  /** vote-answer: 기대 답변 ID (선택지 ID 또는 플레이어 ID) */
  expectedAnswerId?: string;
  /** target-player-not-arrested / target-player-arrested: 대상 플레이어 ID */
  targetPlayerId?: string;
  /** clue-collection: 대상 단서 ID 목록 */
  clueIds?: string[];
  /**
   * clue-collection 매칭 모드:
   * - "all" — 선택한 단서 모두 보유 시 points (1회)
   * - "at-least-n" — N개 이상 보유 시 points (1회). N은 clueCountThreshold.
   * - "per-clue" — 보유한 단서 1개당 points (누적). 1순위 points × ownedCount.
   */
  clueCountMode?: "all" | "at-least-n" | "per-clue";
  /** clue-collection: at-least-n 모드일 때 최소 개수 N */
  clueCountThreshold?: number;
}

/** 승점 조건 1개 */
export interface ScoreCondition {
  description: string; // 예: "범인 검거 성공", "목표 아이템 획득"
  points: number;
  /** 자동 판정 타입. 없거나 "manual"이면 수동 판정(달성 여부 표시 안 함) */
  type?: ScoreConditionType;
  config?: ScoreConditionConfig;
  /**
   * 승리 조건 자동 연동 항목 마커. 메이커가 승리 조건 라디오를 선택하면 자동 생성/유지된다.
   * 메이커 [승점] 탭에서는 표시·편집 안 됨(자동 관리). 승리 조건 영역에서 점수 액수만 편집 가능.
   * 한 캐릭터당 1개만 존재.
   */
  autoFromVictory?: boolean;
}

/** 미확신(uncertain) 캐릭터의 게임 도중 입장 결정 트리거. */
export type UncertainResolutionTrigger =
  | { kind: "round-reached"; round: number; resolveAs: "culprit" | "innocent"; message?: string }
  | { kind: "clue-seen"; clueId: string; resolveAs: "culprit" | "innocent"; message?: string };

/**
 * 미확신 캐릭터의 트리거 정의.
 *
 * `triggers` array — 발동 조건 묶음. 발동 시 `SharedState.uncertainResolutions[playerId]`에 결정 박힘.
 * `triggerMatch`로 매칭 모드 결정:
 * - `"any"` (기본): 어느 한 트리거라도 만족하면 발동. 첫 만족 트리거의 `resolveAs` 채택.
 * - `"all"`: 모든 트리거 동시 만족 시 발동. 마지막 만족 트리거 시점에 첫 트리거의 `resolveAs` 채택.
 *
 * `defaultResolveAs`가 있으면 어떤 트리거도 발동 안 했을 때 게임 종료 시 default 적용. 없으면 "uncertain" 라벨 유지.
 * `triggers` 빈 array = "라벨만 유지, 자동 결정 안 함".
 *
 * 트리거 발동 시 본인 카드 toast: 메이커가 `message` 입력했으면 그것, 없으면 시스템 기본 ("당신이 범인이었습니다." / "당신은 무고합니다.").
 */
export interface UncertainResolution {
  triggers: UncertainResolutionTrigger[];
  triggerMatch?: "any" | "all";
  defaultResolveAs?: "culprit" | "innocent";
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
  /**
   * true면 이 캐릭터가 해당 슬롯에 의도적으로 등장/행동하지 않는다는 표시.
   * 검증(누락 경고)과 AI 도우미가 "아직 안 적은 것"과 "일부러 비운 것"을 구분하기 위해 쓴다.
   * 기본값은 false(= 일반 미입력 상태).
   */
  inactive?: boolean;
}

export interface Player {
  id: string;
  name: string; // 캐릭터 이름
  victoryCondition: VictoryCondition;
  /**
   * [deprecated] victoryCondition === "personal-goal"일 때 목표 설명.
   * 신규 시스템에서는 `scoreConditions`에 개인 목표 4 케이스(target-player-not-arrested 등)로 자동 판정.
   * 기존 데이터 호환용으로 유지. 마이그레이션 시 `scoreConditions[manual]`로 이전.
   */
  personalGoal?: string;
  scoreConditions: ScoreCondition[]; // 승점 조건 목록 (기본 + 추가 통합)
  background: string; // 캐릭터 배경 (전원 공개)
  story: string; // 캐릭터 상세 스토리
  secret: string; // 비밀 정보
  /** legacy field — 기존 데이터 호환용 */
  alibi?: string;
  timelineEntries: PlayerTimelineEntry[]; // 슬롯별 행동 타임라인
  relatedClues: RelatedClueRef[]; // 연관 단서 카드 + 설명
  relationships: Relationship[];
  cardImage?: string;
  /**
   * 미확신(victoryCondition === "uncertain") 캐릭터의 게임 도중 입장 결정 트리거.
   * 비어있으면 "라벨만 유지, 자동 결정 안 함" 모드. 메이커 시나리오 안내 텍스트 노출만.
   */
  uncertainResolution?: UncertainResolution;
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
  unlocksAtRound: number | null;
  clueIds: string[];
  ownerPlayerId?: string;         // 이 장소 소유자 — 해당 플레이어는 접근 불가
  accessCondition?: ClueCondition; // 입장 조건 (없으면 자유 입장)
  previewCluesEnabled?: boolean;  // 획득 전 단서 미리보기 활성화
}

export interface Clue {
  id: string;
  title: string;
  description: string;
  /**
   * owned: 획득자 인벤토리에 들어가고 건네주기/소유 이전 가능.
   * shared: 첫 발견자만 조사회수 1회 차감, 이후 본인/타인 재조사 무료. 인벤토리 미진입.
   *
   * legacy 값(physical/testimony/scene)은 normalizer에서 자동 변환된다.
   */
  type: "owned" | "shared";
  imageUrl?: string;          // 플레이어 인벤토리/상세에 노출할 단서 이미지
  locationId: string;
  /** legacy field — 기존 데이터 호환용 */
  pointsTo?: string;
  /** legacy field — 기존 데이터 호환용 */
  isSecret?: boolean;
  condition?: ClueCondition;   // 획득 조건 (없으면 자유 획득)
  previewTitle?: string;       // 획득 전 표시 제목 (미리보기 활성화 시)
  previewDescription?: string; // 획득 전 표시 설명 (미리보기 활성화 시)
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
}

export interface RoundScript {
  round: number;
  narration: string;
  unlockedLocationIds: string[];
  imageUrl?: string;
  videoUrl?: string;
  backgroundMusic?: string;
  /**
   * 라운드 이벤트 사용 여부. false/undefined면 게임의 기본 대표 지도/BGM을 사용한다.
   * 메이커가 [미디어/이벤트] 탭에서 라운드 카드의 on/off 토글로 제어한다.
   */
  enabled?: boolean;
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
  | "culprit-escaped"
  | "custom-choice-matched"
  | "custom-choice-fallback"
  | "vote-round-2-matched"
  | "vote-round-2-fallback";

export interface EndingBranch {
  id: string;
  label: string;
  triggerType: EndingBranchTriggerType;
  /** @deprecated 하위호환용 — culprit-escaped에서 사용했던 대상 캐릭터 */
  targetPlayerId?: string;
  targetQuestionId?: string;   // 연결된 투표 질문 ID
  /** @deprecated 단수 매핑 — targetChoiceIds로 대체 */
  targetChoiceId?: string;
  targetChoiceIds?: string[];  // n:1 매핑 (여러 선택지 → 이 분기)
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

// ─── 투표 질문/선택지 ────────────────────────────────────────

export type VoteTargetMode = "players-only" | "players-and-npcs" | "custom-choices";

export interface VoteQuestionChoice {
  id: string;
  label: string;
  description?: string;
}

export interface VoteQuestionTriggerCondition {
  requiresVoteRound: number;
  questionId: string;
  resultEquals: string;  // targetId가 이 값과 일치할 때 트리거
}

export type VoteQuestionPurpose = "ending" | "personal";

export interface VoteQuestion {
  id: string;
  voteRound: number;                         // 1 = 1차 투표, 2 = 2차 투표
  label: string;                             // 질문 텍스트
  description?: string;
  targetMode: VoteTargetMode;
  purpose: VoteQuestionPurpose;              // ending = 엔딩 결정, personal = 개인 목표
  /** purpose === "personal"일 때, 이 질문을 받을 플레이어 ID. 미지정이면 전원에게 표시한다. */
  personalTargetPlayerId?: string;
  sortOrder: number;
  triggerCondition?: VoteQuestionTriggerCondition; // 2차 투표 트리거 조건
  preStoryText?: string;                     // 2차 투표 전 스토리 텍스트
  preStoryVideoUrl?: string;
  preStoryBackgroundMusic?: string;
  choices: VoteQuestionChoice[];             // custom-choices 모드일 때
}

// ─── 메타데이터 ──────────────────────────────────────────────

export interface GamePublishChecklistItem {
  id: string;
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
