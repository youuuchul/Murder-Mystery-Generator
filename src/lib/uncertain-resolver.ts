import type { GamePackage, UncertainResolutionTrigger } from "@/types/game";
import type { PlayerState, SharedState } from "@/types/session";

/**
 * 미확신(uncertain) 캐릭터의 게임 도중 입장 결정 트리거를 평가한다.
 *
 * 호출 시점:
 * - 페이즈/라운드 변경 후 (`session-phase.ts` advancePhase 또는 라운드 진입)
 * - 단서 acquire/reveal 후 (`cards/route.ts`)
 * - 세션 시작 직후
 *
 * 한 번 결정된 캐릭터(`SharedState.uncertainResolutions[playerId]` 존재)는 다시 평가하지 않는다 — 결정 불변.
 *
 * `triggerMatch`로 매칭 모드 분기:
 * - "any" (기본): 첫 만족 트리거의 `resolveAs` 채택.
 * - "all": 모든 트리거 동시 만족 시 첫 트리거의 `resolveAs` 채택.
 *
 * 단서 트리거(`clue-seen`)는 본인 단위로 평가 — 본인 인벤토리 보유 OR 본인이 모달로 열람한 공용 단서일 때 발동.
 * 다른 플레이어가 발견·공개해도 본인이 카드 모달을 열어보지 않았으면 발동하지 않는다.
 */
export function resolveUncertainTriggers(input: {
  game: GamePackage;
  sharedState: SharedState;
  playerStates: PlayerState[];
}): {
  resolutions: Record<string, "culprit" | "innocent">;
  newlyResolved: { playerId: string; resolveAs: "culprit" | "innocent"; message?: string }[];
  changed: boolean;
} {
  const current = input.sharedState.uncertainResolutions ?? {};
  const next = { ...current };
  const newlyResolved: { playerId: string; resolveAs: "culprit" | "innocent"; message?: string }[] = [];

  for (const player of input.game.players) {
    if (player.victoryCondition !== "uncertain") continue;
    if (next[player.id]) continue; // 이미 결정됨 — 불변

    const triggers = player.uncertainResolution?.triggers ?? [];
    if (triggers.length === 0) continue;

    const matchMode = player.uncertainResolution?.triggerMatch ?? "any";
    const playerState = input.playerStates.find((p) => p.playerId === player.id);

    if (matchMode === "all") {
      const allActive = triggers.every((t) => isTriggerActive(t, input.sharedState, playerState));
      if (allActive) {
        const decided = triggers[0];
        next[player.id] = decided.resolveAs;
        newlyResolved.push({ playerId: player.id, resolveAs: decided.resolveAs, message: decided.message });
      }
      continue;
    }

    // "any" 모드 — 첫 만족 트리거 채택
    for (const trigger of triggers) {
      if (isTriggerActive(trigger, input.sharedState, playerState)) {
        next[player.id] = trigger.resolveAs;
        newlyResolved.push({ playerId: player.id, resolveAs: trigger.resolveAs, message: trigger.message });
        break;
      }
    }
  }

  return {
    resolutions: next,
    newlyResolved,
    changed: newlyResolved.length > 0,
  };
}

/**
 * 게임 종료 시점에 미결정인 미확신 캐릭터에게 `defaultResolveAs`를 일괄 적용한다.
 * 점수 평가 직전에 호출 — `resolveUncertainTriggers`로도 결정 안 된 캐릭터에게만 default 적용.
 */
export function applyUncertainDefaults(input: {
  game: GamePackage;
  sharedState: SharedState;
}): Record<string, "culprit" | "innocent"> {
  const current = input.sharedState.uncertainResolutions ?? {};
  const next = { ...current };
  for (const player of input.game.players) {
    if (player.victoryCondition !== "uncertain") continue;
    if (next[player.id]) continue;
    const def = player.uncertainResolution?.defaultResolveAs;
    if (def) next[player.id] = def;
  }
  return next;
}

function isTriggerActive(
  trigger: UncertainResolutionTrigger,
  sharedState: SharedState,
  playerState: PlayerState | undefined,
): boolean {
  if (trigger.kind === "round-reached") {
    return sharedState.currentRound >= trigger.round;
  }
  if (trigger.kind === "clue-seen") {
    if (!playerState) return false;
    // 본인 단위 평가: 인벤토리 보유 OR 본인이 모달로 열람한 공용 단서. 다른 사람이 봤어도 본인이 안 봤으면 발동 안 함.
    const inInventory = playerState.inventory.some((card) => card.cardId === trigger.clueId);
    const viewedShared = (playerState.viewedSharedClueIds ?? []).includes(trigger.clueId);
    return inInventory || viewedShared;
  }
  return false;
}
