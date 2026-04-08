import type { GameRules, PhaseConfig } from "@/types/game";

export const MIN_PRIVATE_CHAT_PLAYERS = 3;

/**
 * 현재 플레이어 수에서 밀담 기능을 의미 있게 사용할 수 있는지 판단한다.
 * 1~2인 플레이에서는 소그룹 대화가 성립하지 않아 비활성화한다.
 */
export function canUsePrivateChat(playerCount: number): boolean {
  return playerCount >= MIN_PRIVATE_CHAT_PLAYERS;
}

/**
 * 플레이어 수에 맞는 기본 조사/토론 시간을 만든다.
 * 1인 플레이는 토론을 건너뛸 수 있게 토론 시간을 0분으로 둔다.
 */
export function buildDefaultPhases(playerCount: number): PhaseConfig[] {
  const investigationMinutes = playerCount >= 6 ? 20 : 15;

  return [
    {
      type: "investigation",
      label: "조사",
      durationMinutes: investigationMinutes,
    },
    {
      type: "discussion",
      label: "토론",
      durationMinutes: playerCount <= 1 ? 0 : 10,
    },
  ];
}

/**
 * 플레이어 수가 바뀌어도 밀담 설정이 깨지지 않도록 범위를 보정한다.
 * 사용 불가능한 인원 수에서는 기능을 자동으로 끄고 기본값만 유지한다.
 */
export function normalizePrivateChatConfig(
  playerCount: number,
  privateChat?: Partial<GameRules["privateChat"]>
): GameRules["privateChat"] {
  const durationMinutes = Number.isFinite(privateChat?.durationMinutes)
    ? Math.max(1, Math.round(Number(privateChat?.durationMinutes)))
    : 5;

  if (!canUsePrivateChat(playerCount)) {
    return {
      enabled: false,
      maxGroupSize: 2,
      durationMinutes,
    };
  }

  const maxAllowed = Math.max(2, playerCount - 1);
  const requestedMaxGroupSize = Number.isFinite(privateChat?.maxGroupSize)
    ? Math.round(Number(privateChat?.maxGroupSize))
    : Math.min(3, maxAllowed);

  return {
    enabled: privateChat?.enabled ?? true,
    maxGroupSize: Math.max(2, Math.min(maxAllowed, requestedMaxGroupSize)),
    durationMinutes,
  };
}

/**
 * 새 게임 생성과 플레이어 수 변경 시 공통으로 쓰는 기본 규칙 묶음이다.
 * 서버와 메이커 UI가 같은 규칙을 공유하도록 한곳에 둔다.
 */
export function buildDefaultGameRules(playerCount: number): GameRules {
  return {
    roundCount: 4,
    openingDurationMinutes: 5,
    phases: buildDefaultPhases(playerCount),
    privateChat: normalizePrivateChatConfig(playerCount),
    cardTrading: {
      enabled: true,
    },
    cluesPerRound: 2,
    allowLocationRevisit: false,
  };
}
