import type { GamePackage, GameRules } from "@/types/game";
import type { GameSession, SharedState } from "@/types/session";

export type SessionAdvanceConfirmKind = "opening" | "vote";
export type SessionAdvanceRequestAction = "request" | "withdraw";
export type ActiveSessionSubPhase = "investigation" | "discussion";
type SessionAdvanceState = Pick<GameSession, "sharedState">;
const ROUND_SUB_PHASE_LABELS: Record<ActiveSessionSubPhase, string> = {
  investigation: "조사",
  discussion: "토론",
};

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
 * 게임 규칙에서 실제로 사용할 라운드 서브페이즈 목록만 추린다.
 * 0분으로 설정한 페이즈는 진행 순서에서 제외해 1인 플레이를 자연스럽게 처리한다.
 */
export function getEnabledRoundSubPhases(
  rules: Pick<GameRules, "phases"> | undefined
): ActiveSessionSubPhase[] {
  const configuredPhases = (rules?.phases ?? [])
    .map((phase) => phase.type)
    .filter((type, index, array): type is ActiveSessionSubPhase => (
      (type === "investigation" || type === "discussion") && array.indexOf(type) === index
    ));

  const enabledPhases = configuredPhases.filter((type) => {
    const durationMinutes = rules?.phases.find((phase) => phase.type === type)?.durationMinutes;
    return Number.isFinite(durationMinutes) ? Number(durationMinutes) > 0 : true;
  });

  if (enabledPhases.length > 0) {
    return enabledPhases;
  }

  if (configuredPhases.length > 0) {
    return [configuredPhases[0]];
  }

  return ["investigation"];
}

/**
 * 현재 세션이 속해야 할 라운드 서브페이즈를 규칙 기준으로 정규화한다.
 * 저장본이 오래됐거나 0분 페이즈가 비활성화돼도 첫 활성 페이즈로 안전하게 복구한다.
 */
export function getCurrentRoundSubPhase(
  rules: Pick<GameRules, "phases"> | undefined,
  subPhase?: string
): ActiveSessionSubPhase {
  const enabledPhases = getEnabledRoundSubPhases(rules);
  const normalizedSubPhase = normalizeSessionSubPhase(subPhase);

  return enabledPhases.includes(normalizedSubPhase)
    ? normalizedSubPhase
    : enabledPhases[0];
}

/**
 * 현재 서브페이즈 다음에 이어질 활성 서브페이즈가 있는지 계산한다.
 * 없으면 라운드 종료 후 다음 라운드 또는 투표로 넘어가야 한다.
 */
export function getNextRoundSubPhase(
  rules: Pick<GameRules, "phases"> | undefined,
  subPhase?: string
): ActiveSessionSubPhase | null {
  const enabledPhases = getEnabledRoundSubPhases(rules);
  const currentSubPhase = getCurrentRoundSubPhase(rules, subPhase);
  const currentIndex = enabledPhases.indexOf(currentSubPhase);

  if (currentIndex === -1 || currentIndex >= enabledPhases.length - 1) {
    return null;
  }

  return enabledPhases[currentIndex + 1];
}

/**
 * 라운드 서브페이즈 라벨을 한곳에서 관리한다.
 */
export function getRoundSubPhaseLabel(subPhase: ActiveSessionSubPhase): string {
  return ROUND_SUB_PHASE_LABELS[subPhase];
}

/**
 * 페이즈 또는 참가 인원 구성이 바뀌면 기존 진행 요청은 모두 초기화한다.
 * 이전 단계에서 쌓인 요청이 다음 단계까지 남아 자동 진행되는 것을 막는다.
 */
export function clearPhaseAdvanceRequests(sharedState: SharedState): void {
  sharedState.phaseAdvanceRequestPlayerIds = [];
}

/**
 * 공통 페이즈 시작 시각을 갱신한다.
 * 오프닝 제한시간과 이후 공용 타이머 확장 시 같은 기준을 재사용한다.
 */
export function markPhaseStarted(sharedState: SharedState, now: string): void {
  sharedState.phaseStartedAt = now;
}

/**
 * 현재 세션을 다음 진행 단계로 한 칸 이동시킨다.
 * 플레이어 합의 진행과 GM 수동 진행이 같은 규칙을 쓰도록 공용 로직으로 둔다.
 */
export function applySessionAdvanceStep(session: GameSession, game: GamePackage): void {
  const { sharedState } = session;
  const maxRound = game.rules?.roundCount ?? 4;
  const now = new Date().toISOString();

  clearPhaseAdvanceRequests(sharedState);

  if (sharedState.phase === "lobby") {
    sharedState.phase = "opening";
    session.startedAt = now;
    markPhaseStarted(sharedState, now);
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: now,
      message: "오프닝이 시작됩니다.",
      type: "phase_changed",
    });
    return;
  }

  if (sharedState.phase === "opening") {
    sharedState.phase = "round-1";
    sharedState.currentRound = 1;
    sharedState.currentSubPhase = getCurrentRoundSubPhase(game.rules);
    markPhaseStarted(sharedState, now);
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: now,
      message: `Round 1 ${getRoundSubPhaseLabel(sharedState.currentSubPhase)} 페이즈가 시작됩니다.`,
      type: "phase_changed",
    });
    return;
  }

  if (sharedState.phase.startsWith("round-")) {
    const nextSubPhase = getNextRoundSubPhase(game.rules, sharedState.currentSubPhase);

    if (nextSubPhase) {
      sharedState.currentSubPhase = nextSubPhase;
      sharedState.eventLog.push({
        id: crypto.randomUUID(),
        timestamp: now,
        message: `${getRoundSubPhaseLabel(nextSubPhase)} 페이즈가 시작됩니다.`,
        type: "phase_changed",
      });
      return;
    }

    if (sharedState.currentRound >= maxRound) {
      sharedState.phase = "vote";
      sharedState.currentSubPhase = undefined;
      markPhaseStarted(sharedState, now);
      sharedState.eventLog.push({
        id: crypto.randomUUID(),
        timestamp: now,
        message: "투표 페이즈가 시작됩니다.",
        type: "phase_changed",
      });
      return;
    }

    sharedState.phase = `round-${sharedState.currentRound + 1}`;
    sharedState.currentRound += 1;
    sharedState.currentSubPhase = getCurrentRoundSubPhase(game.rules);
    markPhaseStarted(sharedState, now);
    sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: now,
      message: `Round ${sharedState.currentRound} ${getRoundSubPhaseLabel(sharedState.currentSubPhase)} 페이즈가 시작됩니다.`,
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
    const nextSubPhase = getNextRoundSubPhase(game.rules, session.sharedState.currentSubPhase);
    if (nextSubPhase) return `${getRoundSubPhaseLabel(nextSubPhase)} 시작 요청`;
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

  if (
    phase.startsWith("round-")
    && currentRound >= maxRound
    && getNextRoundSubPhase(game.rules, session.sharedState.currentSubPhase) === null
  ) {
    return "vote";
  }

  return null;
}
