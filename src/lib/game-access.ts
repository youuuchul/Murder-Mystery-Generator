import type { GameAccessMeta, GameMetadata, GamePackage } from "@/types/game";

export type GameOwnershipState = "owned" | "claimable" | "readonly";

type GameWithAccess = Pick<GamePackage, "access"> | Pick<GameMetadata, "access">;

/**
 * 현재 게임이 아직 어느 작업자에게도 귀속되지 않은 레거시 데이터인지 판별한다.
 * Phase 2 이행 중에는 빈 ownerId를 가진 게임을 첫 편집 작업자에게 귀속시킨다.
 */
export function isClaimableLegacyGame(game: GameWithAccess): boolean {
  return game.access.ownerId.trim().length === 0;
}

/** 현재 작업자가 게임 소유자인지 검사한다. */
export function isGameOwner(game: GameWithAccess, userId: string): boolean {
  return game.access.ownerId.trim() === userId.trim();
}

/** 현재 작업자 기준으로 게임 소유권 상태를 계산한다. */
export function getGameOwnershipState(
  game: GameWithAccess,
  userId: string
): GameOwnershipState {
  if (isClaimableLegacyGame(game)) {
    return "claimable";
  }

  return isGameOwner(game, userId) ? "owned" : "readonly";
}

/**
 * 레거시 무소유 게임이면 현재 작업자에게 귀속시킨 새 게임 객체를 만든다.
 * 이미 소유자가 있으면 원본을 그대로 돌려준다.
 */
export function claimGameOwnership(
  game: GamePackage,
  userId: string,
  now = new Date().toISOString()
): GamePackage {
  if (!isClaimableLegacyGame(game)) {
    return game;
  }

  return {
    ...game,
    updatedAt: now,
    access: {
      ...game.access,
      ownerId: userId.trim(),
      visibility: normalizeGameVisibility(game.access),
    },
  };
}

/**
 * 현재 소유자 여부와 상관없이 게임 ownerId 를 명시적으로 바꾼 새 객체를 만든다.
 * claimable 게임 귀속과 소유자 이관에서 공통으로 사용한다.
 */
export function reassignGameOwnership(
  game: GamePackage,
  nextOwnerId: string,
  now = new Date().toISOString()
): GamePackage {
  return {
    ...game,
    updatedAt: now,
    access: {
      ...game.access,
      ownerId: nextOwnerId.trim(),
      visibility: normalizeGameVisibility(game.access),
    },
  };
}

/**
 * 현재 작업자가 수정 가능한 게임인지 확인하고,
 * 필요하면 레거시 게임을 현재 작업자 소유로 귀속한 복사본을 함께 돌려준다.
 */
export function resolveEditableGameForUser(
  game: GamePackage,
  userId: string
): { game: GamePackage; claimed: boolean } | null {
  const ownershipState = getGameOwnershipState(game, userId);

  if (ownershipState === "readonly") {
    return null;
  }

  if (ownershipState === "claimable") {
    return {
      game: claimGameOwnership(game, userId),
      claimed: true,
    };
  }

  return {
    game,
    claimed: false,
  };
}

/**
 * GM 화면 진입 / 세션 시작 가능 여부를 판별한다.
 * 공개 게임은 누구나 가능하고, 비공개/초안은 소유자 또는 귀속 가능한 레거시 게임만 허용한다.
 */
export function canAccessGmPlay(game: GameWithAccess, userId?: string): boolean {
  if (normalizeGameVisibility(game.access) === "public") {
    return true;
  }

  if (!userId) {
    return false;
  }

  return getGameOwnershipState(game, userId) !== "readonly";
}

function normalizeGameVisibility(access: GameAccessMeta): GameAccessMeta["visibility"] {
  return access.visibility === "draft"
    || access.visibility === "private"
    || access.visibility === "public"
    ? access.visibility
    : "private";
}
