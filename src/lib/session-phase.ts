import type { GamePackage } from "@/types/game";
import type { GameSession, SharedState } from "@/types/session";

export type SessionAdvanceConfirmKind = "opening" | "vote";
export type SessionAdvanceRequestAction = "request" | "withdraw";
export type ActiveSessionSubPhase = "investigation" | "discussion";
type SessionAdvanceState = Pick<GameSession, "sharedState">;

/**
 * 세션 서브페이즈 값을 현재 앱 기준의 조사 / 토론 2단계로 정규화한다.
 * 예전 데이터의 `briefing` 도 토론 단계로 흡수한다.
 */
export function normalizeSessionSubPhase(subPhase?: string): ActiveSessionSubPhase {
  return subPhase === "discussion" || subPhase === "briefing"
    ? "discussion"
    : "investigation";
}

/**
 * 페이즈 또는 참가 인원 구성이 바뀌면 기존 진행 요청은 모두 초기화한다.
 * 이전 단계에서 쌓인 요청이 다음 단계까지 남아 자동 진행되는 것을 막는다.
 */
export function clearPhaseAdvanceRequests(sharedState: SharedState): void {
  sharedState.phaseAdvanceRequestPlayerIds = [];
}

/**
 * 현재 세션을 다음 진행 단계로 한 칸 이동시킨다.
 * 플레이어 합의 진행과 GM 수동 진행이 같은 규칙을 쓰도록 공용 로직으로 둔다.
 */
export function applySessionAdvanceStep(session: GameSession, game: GamePackage): void {
  const { sharedState } = session;
  const maxRound = game.rules?.roundCount ?? 4;

  clearPhaseAdvanceRequests(sharedState);

  if (sharedState.phase === "lobby") {
    sharedState.phase = "opening";
    session.startedAt = new Date().toISOString();
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: "오프닝이 시작됩니다.",
      type: "phase_changed",
    });
    return;
  }

  if (sharedState.phase === "opening") {
    sharedState.phase = "round-1";
    sharedState.currentRound = 1;
    sharedState.currentSubPhase = "investigation";
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: "Round 1 조사 페이즈가 시작됩니다.",
      type: "phase_changed",
    });
    return;
  }

  if (sharedState.phase.startsWith("round-")) {
    const currentSubPhase = normalizeSessionSubPhase(sharedState.currentSubPhase);

    if (currentSubPhase === "investigation") {
      sharedState.currentSubPhase = "discussion";
      sharedState.eventLog.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: "토론 페이즈가 시작됩니다.",
        type: "phase_changed",
      });
      return;
    }

    if (sharedState.currentRound >= maxRound) {
      sharedState.phase = "vote";
      sharedState.currentSubPhase = undefined;
      sharedState.eventLog.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        message: "투표 페이즈가 시작됩니다.",
        type: "phase_changed",
      });
      return;
    }

    sharedState.phase = `round-${sharedState.currentRound + 1}`;
    sharedState.currentRound += 1;
    sharedState.currentSubPhase = "investigation";
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `Round ${sharedState.currentRound} 조사 페이즈가 시작됩니다.`,
      type: "phase_changed",
    });
    return;
  }

  throw new Error("이 단계에서는 다음 페이즈로 진행할 수 없습니다.");
}

/**
 * 현재 플레이어 화면에서 보여줄 `다음 단계 진행 요청` 문구를 계산한다.
 */
export function getPlayerAdvanceRequestLabel(session: SessionAdvanceState, game: GamePackage): string {
  const maxRound = game.rules?.roundCount ?? 4;
  const { phase, currentRound } = session.sharedState;

  if (phase === "lobby") return "오프닝 시작 요청";
  if (phase === "opening") return "Round 1 시작 요청";

  if (phase.startsWith("round-")) {
    const currentSubPhase = normalizeSessionSubPhase(session.sharedState.currentSubPhase);
    if (currentSubPhase === "investigation") return "토론 시작 요청";
    return currentRound >= maxRound ? "투표 시작 요청" : `Round ${currentRound + 1} 시작 요청`;
  }

  return "다음 단계 진행 요청";
}

/**
 * 사용자 확인 팝업이 필요한 전환만 따로 판정한다.
 * 오프닝 시작과 최종 투표 진입은 실수 비용이 커서 한 번 더 확인한다.
 */
export function getAdvanceConfirmKind(session: SessionAdvanceState, game: GamePackage): SessionAdvanceConfirmKind | null {
  const maxRound = game.rules?.roundCount ?? 4;
  const { phase, currentRound } = session.sharedState;

  if (phase === "lobby") {
    return "opening";
  }

  if (phase.startsWith("round-") && currentRound >= maxRound) {
    return "vote";
  }

  return null;
}
