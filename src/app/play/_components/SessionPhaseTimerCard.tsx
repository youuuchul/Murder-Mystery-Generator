"use client";

import { useEffect, useRef, useState } from "react";
import {
  formatSignedTimerSeconds,
  getSessionPhaseTimerSnapshot,
  getSignedRemainingSeconds,
  TIMER_OVERRUN_CAP_SECONDS,
} from "@/lib/session-timer";
import type { GameRules } from "@/types/game";
import type { SharedState } from "@/types/session";
import type { SessionPhaseTimerSnapshot } from "@/lib/session-timer";

type TimerMilestone = "one-minute" | "expired";

interface SessionPhaseTimerCardProps {
  sharedState: Pick<SharedState, "phase" | "phaseStartedAt" | "currentSubPhase" | "timerState">;
  rules: Pick<GameRules, "openingDurationMinutes" | "phases">;
  className?: string;
  onMilestone?: (milestone: TimerMilestone, timer: SessionPhaseTimerSnapshot) => void;
}

/**
 * GM 화면과 플레이어 진행 요청 패널에서 함께 쓰는 단일 페이즈 타이머 카드.
 * 오프닝과 라운드 모두 phaseStartedAt을 기준으로 읽기 전용 카운트다운만 표시한다.
 */
export default function SessionPhaseTimerCard({
  sharedState,
  rules,
  className = "",
  onMilestone,
}: SessionPhaseTimerCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const milestoneRef = useRef<{ key: string; oneMinute: boolean; expired: boolean } | null>(null);

  const timer = getSessionPhaseTimerSnapshot(sharedState, rules);
  const isRunning = Boolean(timer?.startedAt);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, timer?.key]);

  useEffect(() => {
    if (!timer?.startedAt || !onMilestone) {
      return;
    }

    if (!milestoneRef.current || milestoneRef.current.key !== timer.key) {
      milestoneRef.current = { key: timer.key, oneMinute: false, expired: false };
    }

    const rawRemainingSeconds = getSignedRemainingSeconds(
      timer.startedAt,
      timer.durationSeconds,
      now,
      Number.POSITIVE_INFINITY
    );

    if (
      rawRemainingSeconds <= 60
      && rawRemainingSeconds > 0
      && !milestoneRef.current.oneMinute
    ) {
      milestoneRef.current.oneMinute = true;
      onMilestone("one-minute", timer);
    }

    if (rawRemainingSeconds <= 0 && !milestoneRef.current.expired) {
      milestoneRef.current.expired = true;
      onMilestone("expired", timer);
    }
  }, [now, onMilestone, timer]);

  if (!timer) {
    return null;
  }

  const displaySeconds = timer.startedAt
    ? getSignedRemainingSeconds(timer.startedAt, timer.durationSeconds, now)
    : timer.durationSeconds;
  const rawDisplaySeconds = timer.startedAt
    ? getSignedRemainingSeconds(timer.startedAt, timer.durationSeconds, now, Number.POSITIVE_INFINITY)
    : displaySeconds;
  const isCapped = rawDisplaySeconds < -TIMER_OVERRUN_CAP_SECONDS;
  const isOvertime = displaySeconds < 0;
  const isUnderMinute = displaySeconds > 0 && displaySeconds <= 60;
  const heading = timer.phaseLabel === timer.label
    ? timer.phaseLabel
    : `${timer.phaseLabel} - ${timer.label}`;
  const progress = timer.startedAt && timer.durationSeconds > 0
    ? Math.max(0, Math.min(100, (Math.max(0, displaySeconds) / timer.durationSeconds) * 100))
    : 100;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-dark-100">
            {heading}
          </p>
        </div>
        <p
          className={[
            "shrink-0 font-mono text-xl font-semibold tabular-nums",
            isOvertime ? "text-red-300" : isUnderMinute ? "text-amber-300" : "text-dark-100",
          ].join(" ")}
        >
          {formatSignedTimerSeconds(displaySeconds, isCapped)}
        </p>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-dark-800">
        <div
          className={[
            "h-full rounded-full transition-all duration-1000",
            isOvertime ? "bg-red-500" : isUnderMinute ? "bg-amber-500" : "bg-mystery-600",
          ].join(" ")}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
