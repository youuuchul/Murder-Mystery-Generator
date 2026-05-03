import type { Player, Story, StoryNpc, VictoryCondition } from "@/types/game";

/**
 * 범인 식별자 시스템.
 *
 * `Story.culpritPlayerId` 는 단일 문자열 컬럼이지만,
 *  - 플레이어가 범인이면 `player.id` (UUID)
 *  - NPC 가 범인이면 `npc.id` (UUID)
 *  - 피해자가 범인이면 고정 문자열 `"victim"`
 * 세 종류 중 하나가 들어간다. player/npc UUID 는 `crypto.randomUUID()` 출처라 충돌 가능성이 사실상 0.
 *
 * DB 컬럼/타입 구조를 그대로 둔 채 의미만 확장한 형태이므로,
 * 마이그레이션 없이 호환된다. 새로 코드를 짤 때는 직접 문자열 비교 대신
 * 이 모듈의 헬퍼를 거치는 것을 원칙으로 한다.
 */

export const CULPRIT_VICTIM_ID = "victim";

export type CulpritKind = "player" | "victim" | "npc";

export interface CulpritIdentity {
  kind: CulpritKind;
  id: string;
  name: string;
}

/**
 * 저장된 culpritId 가 어떤 종류인지 분해해 이름과 함께 돌려준다.
 * 매칭되는 대상이 없으면(예: 삭제된 캐릭터를 가리키는 stale id) `null`.
 */
export function resolveCulpritIdentity(
  culpritId: string | undefined | null,
  players: Player[],
  story: Story,
): CulpritIdentity | null {
  const id = (culpritId ?? "").trim();
  if (!id) return null;

  if (id === CULPRIT_VICTIM_ID) {
    const victimName = story.victim?.name?.trim();
    if (!victimName) return null;
    return { kind: "victim", id: CULPRIT_VICTIM_ID, name: victimName };
  }

  const player = players.find((p) => p.id === id);
  if (player) {
    return { kind: "player", id, name: player.name?.trim() || "(이름 없음)" };
  }

  const npc = story.npcs?.find((n) => n.id === id);
  if (npc) {
    return { kind: "npc", id, name: npc.name?.trim() || "(NPC)" };
  }

  return null;
}

/** 메이커 단계에서 "범인이 유효한가" 검증. 캐릭터 삭제 등으로 stale 한 id 가 박혀 있으면 false. */
export function isCulpritIdValid(
  culpritId: string | undefined | null,
  players: Player[],
  story: Story,
): boolean {
  return resolveCulpritIdentity(culpritId, players, story) !== null;
}

/**
 * 투표·승점 판정에서 "이 targetId 가 범인 본인을 가리키는가" 확인용.
 * culpritId 와 단순 비교를 한 곳으로 모아두기 위한 wrapper.
 */
export function isCulpritTargetId(
  culpritId: string | undefined | null,
  targetId: string | undefined | null,
): boolean {
  const left = (culpritId ?? "").trim();
  const right = (targetId ?? "").trim();
  if (!left || !right) return false;
  return left === right;
}

export const CULPRIT_KIND_LABEL: Record<CulpritKind, string> = {
  player: "플레이어",
  victim: "피해자",
  npc: "NPC",
};

/** UI 라벨용. "박철수 (피해자)" 같은 형식. */
export function formatCulpritLabel(identity: CulpritIdentity): string {
  if (identity.kind === "player") return identity.name;
  return `${identity.name} (${CULPRIT_KIND_LABEL[identity.kind]})`;
}

/**
 * 메이커가 명시할 수 있는 승리조건 override.
 *
 * `Player.victoryCondition` 의 4-enum 중 자동 파생 가능한 2개(`avoid-arrest` / `arrest-culprit`)는
 * `Story.culpritPlayerId` 1 곳을 보면 100% 결정되므로 메이커 입력에서 제외한다.
 * 자동 파생 불가능한 2개만 메이커가 명시:
 * - `personal-goal`: "이 캐릭터는 범인이든 무고든 별개로 추가 개인 목표가 있다"
 * - `uncertain`: "게임 시작 시 입장 미정, 도중에 결정됨" (런타임 변환 트리거는 별도 백로그)
 *
 * 기존 `victoryCondition === "avoid-arrest"` / `"arrest-culprit"` 데이터는 호환을 위해 그대로 둔다.
 * `getDisplayedVictoryRole` 헬퍼가 항상 자동 파생을 우선해 모순을 자동 정정한다.
 */
export type VictoryConditionOverride = "personal-goal" | "uncertain";

/**
 * 화면에 표시할 캐릭터 승리조건을 결정한다.
 *
 * 진실의 원천:
 * - 메이커가 `personal-goal`이면 그대로
 * - `uncertain`이면 런타임 결정 우선: `uncertainResolutions[player.id]`가 박혀 있으면 그 결정으로 변환
 *   ("culprit" → "avoid-arrest", "innocent" → "arrest-culprit"). 미결정이면 그대로 "uncertain".
 * - 그 외는 `Story.culpritPlayerId` 기반 자동 파생 (`avoid-arrest` / `arrest-culprit`)
 *
 * 이 헬퍼만 거치면 `victoryCondition` 4-enum 어떤 값이 저장돼있어도 culpritPlayerId/런타임 결정과의
 * 모순이 자동 정정된다. 사용처: 본인 카드 라벨, AI stance, 메이커 어시스턴트 컨텍스트, 점수 라벨 등.
 */
export function getDisplayedVictoryRole(
  player: Player,
  story: Story,
  uncertainResolutions?: Record<string, "culprit" | "innocent">,
): VictoryCondition {
  const override = player.victoryCondition;
  if (override === "personal-goal") return "personal-goal";
  if (override === "uncertain") {
    const decided = uncertainResolutions?.[player.id];
    if (decided === "culprit") return "avoid-arrest";
    if (decided === "innocent") return "arrest-culprit";
    return "uncertain";
  }
  // override가 옛 `avoid-arrest` / `arrest-culprit` 또는 비어있어도 자동 파생 우선.
  return story.culpritPlayerId === player.id ? "avoid-arrest" : "arrest-culprit";
}

/**
 * 메이커 UI에서 사용하는 3-옵션 토글 값.
 * `auto`는 빈 override(또는 옛 자동 파생 가능 enum)를 의미한다.
 */
export type VictoryConditionInputMode = "auto" | "personal-goal" | "uncertain";

export function getVictoryConditionInputMode(player: Player): VictoryConditionInputMode {
  if (player.victoryCondition === "personal-goal") return "personal-goal";
  if (player.victoryCondition === "uncertain") return "uncertain";
  return "auto";
}

/**
 * 투표 자동 선택지(`players-and-npcs` 모드)의 표준 구성.
 * 플레이어 + NPC + 피해자(이름이 있을 때만)를 이 순서로 합친다.
 */
export function buildPlayersNpcsVictimTargets(
  players: Player[],
  npcs: StoryNpc[],
  victim: Story["victim"] | undefined,
): { id: string; label: string }[] {
  const list: { id: string; label: string }[] = [
    ...players.map((p) => ({ id: p.id, label: p.name?.trim() || "(이름 없음)" })),
    ...(npcs ?? []).map((n) => ({
      id: n.id,
      label: `${n.name?.trim() || "(NPC)"} (NPC)`,
    })),
  ];
  const victimName = victim?.name?.trim();
  if (victimName) {
    list.push({ id: CULPRIT_VICTIM_ID, label: `${victimName} (피해자)` });
  }
  return list;
}
