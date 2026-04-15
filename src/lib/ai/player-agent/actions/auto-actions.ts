import {
  propagateAttributes,
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";
import { startLangfuseTracing } from "@/lib/ai/langfuse";
import type { Clue, ClueCondition, GamePackage } from "@/types/game";
import type {
  GameSession,
  PlayerAgentActionState,
  PlayerAgentSlotState,
  PlayerState,
} from "@/types/session";

type PlayerAgentAutoActionTrigger =
  | "human_clue_acquired"
  | "gm_advance_phase"
  | "phase_request_advance"
  | "human_vote_submitted";

export interface PlayerAgentAutoAcquireOutcome {
  acted: boolean;
  trigger: PlayerAgentAutoActionTrigger;
  triggerPlayerId?: string;
  actorPlayerId?: string;
  actorCharacterName?: string;
  acquiredClueId?: string;
  acquiredClueTitle?: string;
  unlockedLocationId?: string;
  unlockedLocationName?: string;
  reason?: string;
}

export interface PlayerAgentAutoVoteEntry {
  actorPlayerId: string;
  actorCharacterName: string;
  targetPlayerId: string;
  targetCharacterName: string;
}

export interface PlayerAgentAutoVoteOutcome {
  acted: boolean;
  trigger: PlayerAgentAutoActionTrigger;
  submittedCount: number;
  entries: PlayerAgentAutoVoteEntry[];
  reason?: string;
}

/**
 * 플레이어 단서 획득 직후 AI가 이어서 행동할지 판단하고,
 * 가능하면 AI 슬롯 1개에 대해 단서 획득을 실제 세션 상태에 반영한다.
 *
 * 1차 구현 원칙:
 * - 한 번의 인간 획득 이벤트당 AI도 최대 1회만 반응한다.
 * - 공개 상태(`sharedState`) 기준 제약(중복 획득, 라운드 잠금, 조건식)을 동일하게 적용한다.
 */
export function applyPlayerAgentAutoAcquireReaction(
  session: GameSession,
  game: GamePackage,
  input: {
    triggerPlayerId: string;
    trigger: PlayerAgentAutoActionTrigger;
    now?: string;
  }
): PlayerAgentAutoAcquireOutcome {
  const now = input.now ?? new Date().toISOString();
  const roundKey = String(session.sharedState.currentRound);

  if (!session.playerAgentState) {
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      reason: "player-agent-state-missing",
    };
  }

  if (!session.sharedState.phase.startsWith("round-")) {
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      reason: "not-round-phase",
    };
  }

  if (session.sharedState.currentSubPhase === "discussion") {
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      reason: "discussion-phase",
    };
  }

  const aiCandidate = pickNextAiAcquireActor(session, roundKey);
  if (!aiCandidate) {
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      reason: "no-ai-slot",
    };
  }

  const { characterSlot, agentSlot } = aiCandidate;
  const aiPlayerState = ensureAiPlayerState(session, characterSlot.playerId);
  const actor = game.players.find((player) => player.id === characterSlot.playerId);
  const actorName = actor?.name ?? "AI 캐릭터";

  // 해제 가능한 장소가 있으면 단서 획득보다 먼저 해제 액션을 쓴다.
  // 같은 턴에 "열기 → 줍기"를 동시에 하지 않고, 다음 트리거로 넘긴다(인간 플레이어 흐름과 동일).
  const unlockableLocation = findUnlockableLocationForAi({
    game,
    session,
    playerState: aiPlayerState,
    playerId: characterSlot.playerId,
  });
  if (unlockableLocation) {
    session.sharedState.unlockedLocationIds = session.sharedState.unlockedLocationIds ?? [];
    if (!session.sharedState.unlockedLocationIds.includes(unlockableLocation.id)) {
      session.sharedState.unlockedLocationIds.push(unlockableLocation.id);
    }

    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: now,
      message: `${actorName}(AI)이(가) 「${unlockableLocation.name}」을(를) 열었습니다.`,
      type: "system",
    });

    agentSlot.runtimeStatus = "acting";
    // 로테이션에서 이번 턴에 이미 행동했음을 기록해 연속 선택을 방지한다.
    agentSlot.actionState = withUpdatedActionState(agentSlot.actionState, {
      lastClueAcquiredAt: now,
      deferredReason: undefined,
    });

    return {
      acted: true,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      actorPlayerId: characterSlot.playerId,
      actorCharacterName: actorName,
      unlockedLocationId: unlockableLocation.id,
      unlockedLocationName: unlockableLocation.name,
    };
  }

  const selectableClues = listSelectableCluesForAi({
    game,
    session,
    playerState: aiPlayerState,
    playerId: characterSlot.playerId,
    roundKey,
  });

  if (selectableClues.length === 0) {
    agentSlot.runtimeStatus = "thinking";
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      actorPlayerId: characterSlot.playerId,
      actorCharacterName: actorName,
      reason: "no-eligible-clue",
    };
  }

  const selectedClue = pickDeterministicClue(selectableClues, session.id, characterSlot.playerId, roundKey);
  const selectedLocation = game.locations.find((location) => location.id === selectedClue.locationId);

  if (!selectedLocation) {
    agentSlot.runtimeStatus = "thinking";
    return {
      acted: false,
      trigger: input.trigger,
      triggerPlayerId: input.triggerPlayerId,
      actorPlayerId: characterSlot.playerId,
      actorCharacterName: actorName,
      reason: "location-not-found",
    };
  }

  const isSharedClue = selectedClue.type === "shared";

  // 공용 단서는 인벤토리에 넣지 않는다 (소유 개념 부재).
  // 인간 플레이어와 동일하게 acquiredClueIds에만 등록하여 "발견" 상태를 남긴다.
  if (!isSharedClue) {
    aiPlayerState.inventory.push({
      cardId: selectedClue.id,
      cardType: "clue",
      acquiredAt: now,
    });
  }

  session.sharedState.acquiredClueIds = session.sharedState.acquiredClueIds ?? [];
  if (!session.sharedState.acquiredClueIds.includes(selectedClue.id)) {
    session.sharedState.acquiredClueIds.push(selectedClue.id);
  }

  aiPlayerState.roundAcquired = aiPlayerState.roundAcquired ?? {};
  aiPlayerState.roundAcquired[roundKey] = (aiPlayerState.roundAcquired[roundKey] ?? 0) + 1;

  const allowLocationRevisit = game.rules?.allowLocationRevisit ?? true;
  if (!allowLocationRevisit) {
    aiPlayerState.roundVisitedLocations = aiPlayerState.roundVisitedLocations ?? {};
    const visited = aiPlayerState.roundVisitedLocations[roundKey] ?? [];
    if (!visited.includes(selectedLocation.id)) {
      aiPlayerState.roundVisitedLocations[roundKey] = [...visited, selectedLocation.id];
    }
  }

  agentSlot.knownCardIds = mergeUniqueIds(agentSlot.knownCardIds, [selectedClue.id]);
  agentSlot.runtimeStatus = "acting";
  agentSlot.actionState = withUpdatedActionState(agentSlot.actionState, {
    lastClueAcquiredAt: now,
    deferredReason: undefined,
  });

  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: now,
    message: isSharedClue
      ? `${actorName}(AI)이 공용 단서 "${selectedClue.title}"을(를) 발견했습니다.`
      : `${actorName}(AI)이 단서를 확보했습니다.`,
    type: isSharedClue ? "system" : "card_received",
  });

  return {
    acted: true,
    trigger: input.trigger,
    triggerPlayerId: input.triggerPlayerId,
    actorPlayerId: characterSlot.playerId,
    actorCharacterName: actorName,
    acquiredClueId: selectedClue.id,
    acquiredClueTitle: selectedClue.title,
  };
}

/**
 * 투표 페이즈에서 아직 투표하지 않은 AI 슬롯들의 표를 자동으로 채운다.
 * 결과 집계는 기존 `session.votes` 맵을 그대로 재사용한다.
 */
export function applyPlayerAgentAutoVotes(
  session: GameSession,
  game: GamePackage,
  input: {
    trigger: PlayerAgentAutoActionTrigger;
    now?: string;
  }
): PlayerAgentAutoVoteOutcome {
  const now = input.now ?? new Date().toISOString();

  if (!session.playerAgentState) {
    return {
      acted: false,
      trigger: input.trigger,
      submittedCount: 0,
      entries: [],
      reason: "player-agent-state-missing",
    };
  }

  if (session.sharedState.phase !== "vote") {
    return {
      acted: false,
      trigger: input.trigger,
      submittedCount: 0,
      entries: [],
      reason: "not-vote-phase",
    };
  }

  const activeSlots = session.sharedState.characterSlots.filter(
    (slot) => slot.isLocked && slot.isAiControlled
  );

  if (activeSlots.length === 0) {
    return {
      acted: false,
      trigger: input.trigger,
      submittedCount: 0,
      entries: [],
      reason: "no-ai-slot",
    };
  }

  session.votes = session.votes ?? {};
  const entries: PlayerAgentAutoVoteEntry[] = [];

  for (const slot of activeSlots) {
    const agentSlot = session.playerAgentState.slots.find((candidate) => candidate.playerId === slot.playerId);
    if (!agentSlot?.enabled) {
      continue;
    }

    const aiState = ensureAiPlayerState(session, slot.playerId);
    if (session.votes[aiState.token]) {
      continue;
    }

    const target = pickAiVoteTarget({
      game,
      session,
      aiPlayerId: slot.playerId,
      roundKey: String(session.sharedState.currentRound),
    });

    if (!target) {
      agentSlot.runtimeStatus = "thinking";
      agentSlot.actionState = withUpdatedActionState(agentSlot.actionState, {
        deferredReason: "vote-target-missing",
      });
      continue;
    }

    session.votes[aiState.token] = target.playerId;
    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: now,
      message: `${target.actorCharacterName}(AI)이 투표를 제출했습니다.`,
      type: "vote_submitted",
    });

    agentSlot.runtimeStatus = "acting";
    agentSlot.actionState = withUpdatedActionState(agentSlot.actionState, {
      lastVoteSubmittedAt: now,
      deferredReason: undefined,
    });

    entries.push({
      actorPlayerId: target.actorPlayerId,
      actorCharacterName: target.actorCharacterName,
      targetPlayerId: target.playerId,
      targetCharacterName: target.characterName,
    });
  }

  session.sharedState.voteCount = Object.keys(session.votes).length;

  return {
    acted: entries.length > 0,
    trigger: input.trigger,
    submittedCount: entries.length,
    entries,
    reason: entries.length > 0 ? undefined : "already-voted-or-no-target",
  };
}


/**
 * AI 자동 투표 제출 결과를 Langfuse trace로 남긴다.
 * 결과 분석에서 "자동 표가 얼마나 제출됐는지"를 바로 볼 수 있게 요약을 넣는다.
 */
export async function tracePlayerAgentAutoVoteOutcome(params: {
  session: Pick<GameSession, "id" | "gameId" | "mode" | "sharedState">;
  outcome: PlayerAgentAutoVoteOutcome;
}): Promise<void> {
  await tracePlayerAgentObservation({
    traceName: "player-agent.auto-vote",
    sessionId: params.session.id,
    gameId: params.session.gameId,
    mode: params.session.mode,
    phase: params.session.sharedState.phase,
    input: {
      trigger: params.outcome.trigger,
      currentRound: params.session.sharedState.currentRound,
      voteCount: params.session.sharedState.voteCount,
    },
    output: {
      acted: params.outcome.acted,
      submittedCount: params.outcome.submittedCount,
      reason: params.outcome.reason ?? null,
      entries: params.outcome.entries.map((entry) => ({
        actorPlayerId: entry.actorPlayerId,
        actorCharacterName: entry.actorCharacterName,
        targetPlayerId: entry.targetPlayerId,
        targetCharacterName: entry.targetCharacterName,
      })),
    },
  });
}

/**
 * trace payload에 민감정보를 넣지 않는 최소 필드만 남기면서,
 * player-agent 자동 행동을 한눈에 분류할 수 있는 공통 태그를 강제한다.
 */
async function tracePlayerAgentObservation(params: {
  traceName: string;
  sessionId: string;
  gameId: string;
  mode: GameSession["mode"];
  phase: GameSession["sharedState"]["phase"];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}): Promise<void> {
  try {
    await startLangfuseTracing();
    await startActiveObservation(params.traceName, async () => propagateAttributes(
      {
        traceName: params.traceName,
        userId: "player-agent",
        sessionId: `player-agent:${params.sessionId}`,
        tags: [
          "player-agent",
          "auto-action",
          `mode:${params.mode}`,
          `phase:${params.phase}`,
        ],
        metadata: {
          feature: "player-agent-actions",
          gameId: params.gameId,
          sessionId: params.sessionId,
        },
      },
      async () => {
        updateActiveObservation({
          input: params.input,
          output: params.output,
          metadata: {
            feature: "player-agent-actions",
            gameId: params.gameId,
            sessionId: params.sessionId,
            phase: params.phase,
            mode: params.mode,
          },
        });
      }
    ));
  } catch (error) {
    console.error("[player-agent] tracing failed", error);
  }
}

function pickNextAiAcquireActor(
  session: GameSession,
  roundKey: string
): { characterSlot: GameSession["sharedState"]["characterSlots"][number]; agentSlot: PlayerAgentSlotState } | null {
  if (!session.playerAgentState) {
    return null;
  }

  const candidates = session.sharedState.characterSlots
    .filter((slot) => slot.isLocked && slot.isAiControlled)
    .map((characterSlot) => {
      const agentSlot = session.playerAgentState?.slots.find((slot) => slot.playerId === characterSlot.playerId);
      return agentSlot?.enabled
        ? { characterSlot, agentSlot, lastActedAt: normalizeActionTime(agentSlot.actionState, roundKey) }
        : null;
    })
    .filter((value): value is {
      characterSlot: GameSession["sharedState"]["characterSlots"][number];
      agentSlot: PlayerAgentSlotState;
      lastActedAt: number;
    } => value !== null);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.lastActedAt - b.lastActedAt);
  return {
    characterSlot: candidates[0].characterSlot,
    agentSlot: candidates[0].agentSlot,
  };
}

function normalizeActionTime(actionState: PlayerAgentActionState | undefined, roundKey: string): number {
  const timestamp = actionState?.lastClueAcquiredAt ?? actionState?.lastVoteSubmittedAt;
  if (!timestamp) {
    return 0;
  }

  const parsed = Number(new Date(timestamp).getTime());
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed + stableHash(roundKey) % 7;
}

function ensureAiPlayerState(session: GameSession, playerId: string): PlayerState {
  const existing = session.playerStates.find((playerState) => playerState.playerId === playerId);
  if (existing) {
    existing.playerName = "AI 플레이어";
    existing.inventory = existing.inventory ?? [];
    existing.transferLog = existing.transferLog ?? [];
    existing.roundAcquired = existing.roundAcquired ?? {};
    existing.roundVisitedLocations = existing.roundVisitedLocations ?? {};
    return existing;
  }

  const nextState: PlayerState = {
    token: `ai-${playerId}-${crypto.randomUUID()}`,
    playerId,
    playerName: "AI 플레이어",
    inventory: [],
    transferLog: [],
    roundAcquired: {},
    roundVisitedLocations: {},
  };

  session.playerStates.push(nextState);
  return nextState;
}

/**
 * character_has_item 조건 장소 중 현재 AI가 targetCharacter이고,
 * 필요 단서를 모두 보유 + 라운드 개방 조건을 만족 + 아직 해제되지 않은 장소를 찾아 반환한다.
 */
function findUnlockableLocationForAi(input: {
  game: GamePackage;
  session: GameSession;
  playerState: PlayerState;
  playerId: string;
}): GamePackage["locations"][number] | null {
  const unlockedIds = input.session.sharedState.unlockedLocationIds ?? [];
  const currentRound = input.session.sharedState.currentRound;

  for (const location of input.game.locations ?? []) {
    const condition = location.accessCondition;
    if (!condition || condition.type !== "character_has_item") continue;
    if (condition.targetCharacterId !== input.playerId) continue;
    if (unlockedIds.includes(location.id)) continue;
    if (
      typeof location.unlocksAtRound === "number"
      && location.unlocksAtRound > currentRound
    ) continue;

    const hasAll = condition.requiredClueIds.every((requiredId) =>
      input.playerState.inventory.some((item) => item.cardId === requiredId)
    );
    if (!hasAll) continue;

    return location;
  }
  return null;
}

function listSelectableCluesForAi(input: {
  game: GamePackage;
  session: GameSession;
  playerState: PlayerState;
  playerId: string;
  roundKey: string;
}): Clue[] {
  const allowLocationRevisit = input.game.rules?.allowLocationRevisit ?? true;
  const cluesPerRound = input.game.rules?.cluesPerRound ?? 0;
  const acquiredThisRound = input.playerState.roundAcquired?.[input.roundKey] ?? 0;

  if (cluesPerRound > 0 && acquiredThisRound >= cluesPerRound) {
    return [];
  }

  const strictCandidates = input.game.clues.filter((clue) => {
    // 이미 발견/획득된 단서는 후보에서 제외 (shared도 동일 — 재발견 의미 없음).
    if (input.session.sharedState.acquiredClueIds.includes(clue.id)) {
      return false;
    }

    if (input.playerState.inventory.some((item) => item.cardId === clue.id)) {
      return false;
    }

    const location = input.game.locations.find((candidate) => candidate.id === clue.locationId);
    if (!location) {
      return false;
    }

    if (location.ownerPlayerId === input.playerId) {
      return false;
    }

    if (
      typeof location.unlocksAtRound === "number"
      && location.unlocksAtRound > input.session.sharedState.currentRound
    ) {
      return false;
    }

    if (!allowLocationRevisit) {
      const visited = input.playerState.roundVisitedLocations?.[input.roundKey] ?? [];
      if (visited.includes(location.id)) {
        return false;
      }
    }

    if (location.accessCondition) {
      const locationConditionResult = evaluateCondition(
        location.accessCondition,
        input.playerState,
        input.session.playerStates
      );
      if (!locationConditionResult.ok) {
        return false;
      }
    }

    if (clue.condition) {
      const clueConditionResult = evaluateCondition(
        clue.condition,
        input.playerState,
        input.session.playerStates
      );
      if (!clueConditionResult.ok) {
        return false;
      }
    }

    return true;
  });

  if (strictCandidates.length > 0) {
    return strictCandidates;
  }

  // 1차 운영 안정화:
  // 조건이 너무 빡빡해서 AI가 계속 아무 행동도 못 하는 상황을 막기 위해,
  // 기본 잠금/중복 제약만 남긴 완화 후보를 fallback으로 한 번 더 시도한다.
  return input.game.clues.filter((clue) => {
    // 이미 발견/획득된 단서는 후보에서 제외 (shared도 동일 — 재발견 의미 없음).
    if (input.session.sharedState.acquiredClueIds.includes(clue.id)) {
      return false;
    }

    if (input.playerState.inventory.some((item) => item.cardId === clue.id)) {
      return false;
    }

    const location = input.game.locations.find((candidate) => candidate.id === clue.locationId);
    if (!location) {
      return false;
    }

    if (location.ownerPlayerId === input.playerId) {
      return false;
    }

    if (
      typeof location.unlocksAtRound === "number"
      && location.unlocksAtRound > input.session.sharedState.currentRound
    ) {
      return false;
    }

    return true;
  });
}

function pickDeterministicClue(
  clues: Clue[],
  sessionId: string,
  playerId: string,
  roundKey: string
): Clue {
  if (clues.length === 1) {
    return clues[0];
  }

  const seed = stableHash(`${sessionId}:${playerId}:${roundKey}:${clues.length}`);
  const sorted = [...clues].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[seed % sorted.length];
}

function evaluateCondition(
  condition: ClueCondition,
  playerState: PlayerState,
  allPlayerStates: PlayerState[]
): { ok: boolean } {
  if (condition.type === "has_items") {
    const hasAllItems = condition.requiredClueIds.every((requiredClueId) => (
      playerState.inventory.some((item) => item.cardId === requiredClueId)
    ));
    return { ok: hasAllItems };
  }

  if (condition.type === "character_has_item") {
    if (!condition.targetCharacterId) {
      return { ok: false };
    }

    const targetState = allPlayerStates.find((candidate) => candidate.playerId === condition.targetCharacterId);
    if (!targetState) {
      return { ok: false };
    }

    const hasAllItems = condition.requiredClueIds.every((requiredClueId) => (
      targetState.inventory.some((item) => item.cardId === requiredClueId)
    ));
    return { ok: hasAllItems };
  }

  return { ok: false };
}

function pickAiVoteTarget(input: {
  game: GamePackage;
  session: GameSession;
  aiPlayerId: string;
  roundKey: string;
}): {
  actorPlayerId: string;
  actorCharacterName: string;
  playerId: string;
  characterName: string;
} | null {
  const lockedPlayerIds = input.session.sharedState.characterSlots
    .filter((slot) => slot.isLocked)
    .map((slot) => slot.playerId);

  if (lockedPlayerIds.length === 0) {
    return null;
  }

  const actorCharacter = input.game.players.find((player) => player.id === input.aiPlayerId);
  const actorCharacterName = actorCharacter?.name ?? "AI 캐릭터";

  const candidates = (
    lockedPlayerIds.length > 1
      ? lockedPlayerIds.filter((playerId) => playerId !== input.aiPlayerId)
      : lockedPlayerIds
  ).map((playerId) => {
    const player = input.game.players.find((candidate) => candidate.id === playerId);
    return {
      playerId,
      characterName: player?.name ?? "이름 없음",
      score: scoreVoteCandidate(input, playerId),
    };
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    return a.playerId.localeCompare(b.playerId);
  });

  return {
    actorPlayerId: input.aiPlayerId,
    actorCharacterName,
    playerId: candidates[0].playerId,
    characterName: candidates[0].characterName,
  };
}

/**
 * 1차 휴리스틱:
 * - AI가 들고 있는 단서의 `pointsTo`가 특정 캐릭터를 가리키면 가중치 부여
 * - 동점이면 안정적인 해시 순서로만 결정해 재시도마다 결과가 바뀌지 않게 유지
 */
function scoreVoteCandidate(
  input: {
    game: GamePackage;
    session: GameSession;
    aiPlayerId: string;
    roundKey: string;
  },
  candidatePlayerId: string
): number {
  const aiState = input.session.playerStates.find((playerState) => playerState.playerId === input.aiPlayerId);
  const pointerScore = (aiState?.inventory ?? []).reduce((score, item) => {
    const clue = input.game.clues.find((candidate) => candidate.id === item.cardId);
    if (clue?.pointsTo === candidatePlayerId) {
      return score + 3;
    }
    return score;
  }, 0);

  return pointerScore + (stableHash(`${input.aiPlayerId}:${candidatePlayerId}:${input.roundKey}`) % 2);
}

function withUpdatedActionState(
  current: PlayerAgentActionState | undefined,
  patch: Partial<PlayerAgentActionState>
): PlayerAgentActionState {
  return {
    ...(current ?? {}),
    ...patch,
  };
}

function mergeUniqueIds(base: string[], extra: string[]): string[] {
  const set = new Set([...(base ?? []), ...extra]);
  return [...set];
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
