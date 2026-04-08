import type { GameRules } from "@/types/game";
import type { SharedState } from "@/types/session";

export interface SessionTimerSnapshot {
  label: string;
  startedAt: string;
  durationSeconds: number;
}

/**
 * 오프닝 제한시간을 초 단위로 정규화한다.
 * 값이 비어 있거나 손상된 오래된 데이터는 5분 기본값으로 보정한다.
 */
export function getOpeningDurationSeconds(rules: Pick<GameRules, "openingDurationMinutes">): number {
  const minutes = Number.isFinite(rules.openingDurationMinutes) ? rules.openingDurationMinutes : 5;
  return Math.max(1, Math.round(minutes)) * 60;
}

/**
 * 현재 세션 상태에서 화면에 보여줄 타이머 스냅샷을 계산한다.
 * 지금은 오프닝 제한시간만 다루고, 라운드 타이머 공용화는 이후 단계에서 확장한다.
 */
export function getSessionTimerSnapshot(
  sharedState: Pick<SharedState, "phase" | "phaseStartedAt">,
  rules: Pick<GameRules, "openingDurationMinutes">
): SessionTimerSnapshot | null {
  if (sharedState.phase !== "opening" || !sharedState.phaseStartedAt) {
    return null;
  }

  return {
    label: "오프닝 남은 시간",
    startedAt: sharedState.phaseStartedAt,
    durationSeconds: getOpeningDurationSeconds(rules),
  };
}

/**
 * 시작 시각과 총 제한시간을 바탕으로 남은 시간을 계산한다.
 * 서버와 클라이언트가 같은 기준 문자열을 쓰기 때문에 화면만 새로고침돼도 이어진다.
 */
export function getRemainingSeconds(
  startedAt: string,
  durationSeconds: number,
  now = Date.now()
): number {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return durationSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  return Math.max(0, durationSeconds - elapsedSeconds);
}

/**
 * 남은 초를 `MM:SS` 형태로 포맷한다.
 */
export function formatTimerSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
