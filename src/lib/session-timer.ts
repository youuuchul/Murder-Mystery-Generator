import type { GameRules } from "@/types/game";
import type { ActiveSessionSubPhase } from "@/lib/session-phase";
import { getCurrentRoundSubPhase, getRoundSubPhaseLabel } from "@/lib/session-phase";
import type { SharedState } from "@/types/session";

export const TIMER_OVERRUN_CAP_SECONDS = 10 * 60;

export interface SessionPhaseTimerSnapshot {
  key: string;
  label: string;
  phaseLabel: string;
  durationSeconds: number;
  startedAt?: string;
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
 * 게임 규칙에서 서브페이즈 제한시간(초)을 추출한다.
 */
export function getSubPhaseDurationSeconds(
  rules: Pick<GameRules, "phases"> | undefined,
  subPhase: ActiveSessionSubPhase
): number {
  const cfg = rules?.phases?.find((p) => p.type === subPhase);
  return Math.max(0, cfg?.durationMinutes ?? 10) * 60;
}

/**
 * 오프닝/라운드별 화면 표시용 타이머 스냅샷을 만든다.
 * 라운드는 버튼 없이 phaseStartedAt을 기준으로 흘러가며, 기존 timerState duration은 호환용으로만 참조한다.
 */
export function getSessionPhaseTimerSnapshot(
  sharedState: Pick<SharedState, "phase" | "phaseStartedAt" | "currentSubPhase" | "timerState">,
  rules: Pick<GameRules, "openingDurationMinutes" | "phases">
): SessionPhaseTimerSnapshot | null {
  if (sharedState.phase === "opening" && sharedState.phaseStartedAt) {
    return {
      key: `opening:${sharedState.phaseStartedAt}`,
      label: "오프닝",
      phaseLabel: "오프닝",
      durationSeconds: getOpeningDurationSeconds(rules),
      startedAt: sharedState.phaseStartedAt,
    };
  }

  if (!sharedState.phase.startsWith("round-")) {
    return null;
  }

  const subPhase = getCurrentRoundSubPhase(rules, sharedState.currentSubPhase);
  const subPhaseLabel = getRoundSubPhaseLabel(subPhase);
  const roundLabel = `Round ${sharedState.phase.split("-")[1]}`;
  const startedAt = sharedState.phaseStartedAt ?? sharedState.timerState?.startedAt;

  return {
    key: `${sharedState.phase}:${subPhase}:${startedAt ?? "pending"}`,
    label: subPhaseLabel,
    phaseLabel: roundLabel,
    durationSeconds: sharedState.timerState?.durationSeconds ?? getSubPhaseDurationSeconds(rules, subPhase),
    startedAt,
  };
}

/**
 * 제한시간 초과 후에도 음수 카운트다운을 보여주기 위한 표시용 남은 시간을 계산한다.
 * 장시간 켜둔 화면이 과도한 음수 값을 표시하지 않도록 기본 10분에서 하한을 고정한다.
 */
export function getSignedRemainingSeconds(
  startedAt: string,
  durationSeconds: number,
  now = Date.now(),
  overrunCapSeconds = TIMER_OVERRUN_CAP_SECONDS
): number {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return durationSeconds;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const remainingSeconds = durationSeconds - elapsedSeconds;

  return Math.max(-overrunCapSeconds, remainingSeconds);
}

/**
 * 음수 카운트다운을 `-MM:SS` 형태로 포맷한다.
 * cap에 걸린 값은 `+`를 붙여 실제 초과 시간이 더 길 수 있음을 표시한다.
 */
export function formatSignedTimerSeconds(totalSeconds: number, capped = false): string {
  const sign = totalSeconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  const suffix = capped && totalSeconds < 0 ? "+" : "";

  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${suffix}`;
}
