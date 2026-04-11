import { buildGameForPlayer } from "@/lib/game-sanitizer";
import { buildPlayerSharedBoardContent, type PlayerSharedBoardContent } from "@/lib/player-shared-board";
import type { GamePackage, Player } from "@/types/game";
import type { GameSession, PlayerAgentConversationTurn, PlayerState } from "@/types/session";

export interface PlayerAgentVisibleCard {
  cardId: string;
  title: string;
  description: string;
  type: string;
  acquiredAt: string;
  fromPlayerId?: string;
}

export interface PlayerAgentVisibleCluePreview {
  clueId: string;
  previewTitle: string;
  previewDescription?: string;
  acquired: boolean;
}

export interface PlayerAgentVisibleLocation {
  id: string;
  name: string;
  cluePreview: PlayerAgentVisibleCluePreview[];
}

export interface PlayerAgentVisibleContext {
  session: {
    id: string;
    gameId: string;
    sessionName: string;
    sessionMode: GameSession["mode"];
    phase: GameSession["sharedState"]["phase"];
    currentRound: number;
    currentSubPhase?: GameSession["sharedState"]["currentSubPhase"];
  };
  player: {
    id: string;
    name: string;
    background: string;
    story: string;
    secret: string;
    victoryCondition: Player["victoryCondition"];
    personalGoal?: string;
    relationships: Array<{ targetName: string; description: string }>;
    scoreConditions: Array<{ description: string; points: number }>;
    timeline: Array<{ slotLabel: string; action: string }>;
  };
  publicState: {
    joinedPlayers: { playerId: string; playerName: string | null }[];
    sharedBoard: PlayerSharedBoardContent | null;
  };
  inventory: PlayerAgentVisibleCard[];
  /** 미리보기가 활성화된 장소의 단서 미리보기 정보 */
  locationPreviews: PlayerAgentVisibleLocation[];
  conversationHistory: PlayerAgentConversationTurn[];
}

/**
 * AI 플레이어에게 넘길 최소 공개 컨텍스트를 만든다.
 * 원본 게임 전체를 그대로 넘기지 않고, 현재 캐릭터가 실제로 볼 수 있는 정보만 추린다.
 */
export function buildPlayerAgentVisibleContext(input: {
  game: GamePackage;
  session: GameSession;
  playerState: PlayerState;
  conversationHistory?: PlayerAgentConversationTurn[];
}): PlayerAgentVisibleContext {
  const sanitizedGame = buildGameForPlayer(input.game, input.playerState.playerId);
  const me = sanitizedGame.players.find((player) => player.id === input.playerState.playerId);

  if (!me) {
    throw new Error("AI 플레이어 컨텍스트를 만들 캐릭터를 찾을 수 없습니다.");
  }

  const inventory = input.playerState.inventory.map((item) => {
    const clue = input.game.clues.find((candidate) => candidate.id === item.cardId);
    return {
      cardId: item.cardId,
      title: clue?.title ?? "(제목 없음)",
      description: clue?.description ?? "",
      type: clue?.type ?? "physical",
      acquiredAt: item.acquiredAt,
      fromPlayerId: item.fromPlayerId,
    };
  });

  const inventoryIds = new Set(input.playerState.inventory.map((item) => item.cardId));

  return {
    session: {
      id: input.session.id,
      gameId: input.session.gameId,
      sessionName: input.session.sessionName,
      sessionMode: input.session.mode,
      phase: input.session.sharedState.phase,
      currentRound: input.session.sharedState.currentRound,
      currentSubPhase: input.session.sharedState.currentSubPhase,
    },
    player: {
      id: me.id,
      name: me.name,
      background: me.background,
      story: me.story,
      secret: me.secret,
      victoryCondition: me.victoryCondition,
      personalGoal: me.personalGoal,
      relationships: (me.relationships ?? []).map((rel) => {
        const allPlayers = input.game.players;
        const victim = input.game.story?.victim;
        const npcs = input.game.story?.npcs ?? [];
        let targetName = "알 수 없음";
        if (rel.targetType === "player") {
          targetName = allPlayers.find((p) => p.id === rel.targetId)?.name ?? targetName;
        } else if (rel.targetType === "victim") {
          targetName = victim?.name ?? "피해자";
        } else if (rel.targetType === "npc") {
          targetName = npcs.find((n) => n.id === rel.targetId)?.name ?? targetName;
        }
        return { targetName, description: rel.description };
      }),
      scoreConditions: me.scoreConditions ?? [],
      timeline: (me.timelineEntries ?? [])
        .filter((te) => te.action?.trim())
        .map((te) => {
          const slot = input.game.story?.timeline?.slots?.find((s) => s.id === te.slotId);
          return { slotLabel: slot?.label ?? te.slotId, action: te.action };
        }),
    },
    publicState: {
      joinedPlayers: input.session.sharedState.characterSlots
        .filter((slot) => slot.isLocked)
        .map((slot) => ({
          playerId: slot.playerId,
          playerName: slot.playerName,
        })),
      sharedBoard: buildPlayerSharedBoardContent(input.game, input.session.sharedState),
    },
    inventory,
    locationPreviews: input.game.locations
      .filter((loc) => loc.previewCluesEnabled)
      .map((loc) => ({
        id: loc.id,
        name: loc.name,
        cluePreview: input.game.clues
          .filter((c) => c.locationId === loc.id && c.previewTitle)
          .map((c) => ({
            clueId: c.id,
            previewTitle: c.previewTitle!,
            previewDescription: c.previewDescription,
            acquired: inventoryIds.has(c.id),
          })),
      }))
      .filter((loc) => loc.cluePreview.length > 0),
    conversationHistory: input.conversationHistory ?? [],
  };
}
