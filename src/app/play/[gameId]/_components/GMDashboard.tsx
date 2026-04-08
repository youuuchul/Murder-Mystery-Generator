"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSSE } from "@/hooks/useSSE";
import {
  ENDING_STAGE_LABELS,
  getNextEndingStage,
  normalizeEndingStage,
  resolveActiveEndingBranch,
  resolveBranchPersonalEndings,
} from "@/lib/ending-flow";
import {
  getAdvanceConfirmKind,
  type SessionAdvanceConfirmKind,
} from "@/lib/session-phase";
import {
  formatTimerSeconds,
  getRemainingSeconds,
  getSessionTimerSnapshot,
} from "@/lib/session-timer";
import type { GamePackage, GameRules } from "@/types/game";
import type { EndingStage, GameSession, GameSessionSummary, SharedState, CharacterSlot } from "@/types/session";

interface GMDashboardProps {
  game: GamePackage;
  initialSession: GameSession | null;
  initialSessionSummaries: GameSessionSummary[];
  autoCreateSession?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  lobby: "대기실",
  opening: "오프닝",
  vote: "투표",
  ending: "엔딩",
};

function phaseLabel(phase: string): string {
  if (phase.startsWith("round-")) return `Round ${phase.split("-")[1]}`;
  return PHASE_LABELS[phase] ?? phase;
}

const SUB_PHASE_ORDER = ["investigation", "discussion"] as const;
type ActiveSubPhase = (typeof SUB_PHASE_ORDER)[number];
const SUB_PHASE_LABELS: Record<ActiveSubPhase, string> = {
  investigation: "조사",
  discussion: "토론",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
};

function normalizeSubPhase(subPhase?: string): ActiveSubPhase {
  return subPhase === "discussion" || subPhase === "briefing" ? "discussion" : "investigation";
}

/**
 * 세션 목록 카드에서 한 줄 상태 요약을 만든다.
 */
function getSessionBadgeLabel(session: GameSessionSummary): string {
  if (session.phase.startsWith("round-")) {
    const subPhase = normalizeSubPhase(session.currentSubPhase);
    return `Round ${session.currentRound} · ${SUB_PHASE_LABELS[subPhase]}`;
  }

  return phaseLabel(session.phase);
}

/**
 * 세션 생성 시각을 GM이 빠르게 구분할 수 있는 짧은 문자열로 포맷한다.
 */
function formatSessionCreatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type VideoSource =
  | { kind: "html5"; src: string }
  | { kind: "iframe"; src: string }
  | { kind: "external"; src: string };

interface PhaseBoardContent {
  title: string;
  badge: string;
  narrationBlocks: { label: string; text: string }[];
  guideText?: string;
  imageUrl?: string;
  videoUrl?: string;
  backgroundMusic?: string;
  showSharedImage?: boolean;
}

/** GM 메인 화면에서 재생 가능한 URL을 embed/video 형태로 정규화한다. */
function resolveVideoSource(url?: string): VideoSource | null {
  if (!url) return null;

  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return { kind: "html5", src: url };
  }

  const youtubeMatch =
    url.match(/youtube\.com\/watch\?v=([^&]+)/i) ??
    url.match(/youtu\.be\/([^?&/]+)/i) ??
    url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (youtubeMatch?.[1]) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${youtubeMatch[1]}` };
  }

  const vimeoMatch =
    url.match(/vimeo\.com\/(\d+)/i) ??
    url.match(/player\.vimeo\.com\/video\/(\d+)/i);
  if (vimeoMatch?.[1]) {
    return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { kind: "external", src: url };
  }

  return null;
}

/** 현재 GM 화면에 띄울 페이즈별 메인 보드 콘텐츠를 계산한다. */
function getPhaseBoardContent(game: GamePackage, sharedState: SharedState): PhaseBoardContent {
  const phase = sharedState.phase;
  const roundNum = sharedState.currentRound;
  const roundScript = game.scripts.rounds.find((round) => round.round === roundNum);

  if (phase === "lobby") {
    return {
      title: "대기실",
      badge: "Lobby",
      narrationBlocks: [],
      guideText: game.scripts.lobby.gmNote,
      videoUrl: game.scripts.lobby.videoUrl,
      backgroundMusic: game.scripts.lobby.backgroundMusic,
      showSharedImage: true,
    };
  }

  if (phase === "opening") {
    return {
      title: "오프닝",
      badge: "Opening",
      narrationBlocks: game.scripts.opening.narration
        ? [{ label: "스토리 텍스트", text: game.scripts.opening.narration }]
        : [],
      guideText: game.scripts.opening.gmNote,
      imageUrl: game.story.mapImageUrl,
      videoUrl: game.scripts.opening.videoUrl,
      backgroundMusic: game.scripts.opening.backgroundMusic,
      showSharedImage: true,
    };
  }

  if (phase.startsWith("round-")) {
    const subPhase = normalizeSubPhase(sharedState.currentSubPhase);
    return {
      title: `Round ${roundNum}`,
      badge: SUB_PHASE_LABELS[subPhase],
      narrationBlocks: roundScript?.narration
        ? [{ label: `Round ${roundNum} 이벤트`, text: roundScript.narration }]
        : [],
      guideText: roundScript?.gmNote,
      imageUrl: roundScript?.imageUrl,
      videoUrl: roundScript?.videoUrl,
      backgroundMusic: roundScript?.backgroundMusic,
      showSharedImage: true,
    };
  }

  if (phase === "vote") {
    return {
      title: "투표",
      badge: "Vote",
      narrationBlocks: game.scripts.vote.narration
        ? [{ label: "투표 안내", text: game.scripts.vote.narration }]
        : [],
      guideText: game.scripts.vote.gmNote,
      videoUrl: game.scripts.vote.videoUrl,
      backgroundMusic: game.scripts.vote.backgroundMusic,
      showSharedImage: true,
    };
  }

  if (phase === "ending") {
    const endingStage = normalizeEndingStage(sharedState.endingStage);
    const branch = resolveActiveEndingBranch(game, sharedState.voteReveal);

    return {
      title: "엔딩",
      badge: ENDING_STAGE_LABELS[endingStage],
      narrationBlocks: branch?.storyText
        ? [{ label: branch.label || "분기 엔딩", text: branch.storyText }]
        : [],
      videoUrl: branch?.videoUrl,
      backgroundMusic: branch?.backgroundMusic,
      showSharedImage: false,
    };
  }

  return {
    title: "세션 준비",
    badge: "Ready",
    narrationBlocks: [],
    showSharedImage: true,
  };
}

function MediaPanel({ source, title }: { source: VideoSource | null; title: string }) {
  if (!source) {
    return (
      <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/60 px-4 py-8 text-center text-sm text-dark-600">
        이 페이즈에 연결된 영상이 없습니다.
      </div>
    );
  }

  if (source.kind === "html5") {
    return (
      <video
        controls
        preload="metadata"
        className="w-full rounded-xl border border-dark-700 bg-black aspect-video"
        src={source.src}
      />
    );
  }

  if (source.kind === "iframe") {
    return (
      <iframe
        src={source.src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full rounded-xl border border-dark-700 bg-black aspect-video"
      />
    );
  }

  return (
    <a
      href={source.src}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center rounded-xl border border-emerald-800 bg-emerald-950/20 px-4 py-8 text-sm font-medium text-emerald-300 hover:bg-emerald-950/30 transition-colors"
    >
      외부 영상 열기
    </a>
  );
}

function GMBoard({ game, content }: { game: GamePackage; content: PhaseBoardContent }) {
  const videoSource = resolveVideoSource(content.videoUrl);
  const resolvedImageUrl = content.imageUrl
    ?? (content.showSharedImage ? game.story.mapImageUrl : undefined);
  const showSharedImage = Boolean(resolvedImageUrl);
  const hasBackgroundMusic = Boolean(content.backgroundMusic?.trim());
  const hasNarrationBlocks = content.narrationBlocks.length > 0;
  const hasMediaPanels = Boolean(videoSource) || showSharedImage || hasBackgroundMusic;

  return (
    <div className="rounded-2xl border border-dark-800 overflow-hidden bg-[linear-gradient(145deg,rgba(51,65,85,0.18),rgba(10,14,23,0.94))]">
      <div className="border-b border-dark-800/80 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-dark-50">{content.title}</h3>
        </div>
        <span className="rounded-full border border-mystery-700/60 bg-mystery-950/30 px-3 py-1 text-xs font-medium text-mystery-300">
          {content.badge}
        </span>
      </div>

      {hasNarrationBlocks && (
        <div className="border-b border-dark-800/80 px-5 py-4 space-y-3">
          {content.narrationBlocks.map((block) => (
            <div key={block.label} className="rounded-xl border border-dark-800 bg-dark-950/70 p-4">
              <p className="text-xs text-mystery-500">{block.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-dark-200 whitespace-pre-line">{block.text}</p>
            </div>
          ))}
        </div>
      )}

      {hasMediaPanels && (
        <div
          className={[
            "grid gap-4 p-5",
            videoSource && (showSharedImage || hasBackgroundMusic) ? "xl:grid-cols-[1.15fr_0.85fr]" : "",
          ].join(" ")}
        >
          {videoSource && (
            <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4 space-y-3">
              <p className="text-xs text-dark-500">페이즈 영상</p>
              <MediaPanel source={videoSource} title={content.title} />
            </div>
          )}

          {(showSharedImage || hasBackgroundMusic) && (
            <div className="space-y-4">
              {showSharedImage && (
                <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4 space-y-3">
                  <p className="text-xs text-dark-500">공통 이미지 / 지도</p>
                  <div className="relative overflow-hidden rounded-xl border border-dark-700 bg-dark-950/80 aspect-[16/9]">
                    {resolvedImageUrl ? (
                      <Image
                        src={resolvedImageUrl}
                        alt={`${game.title} 공통 이미지`}
                        fill
                        sizes="(max-width: 1280px) 100vw, 960px"
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {hasBackgroundMusic && content.backgroundMusic && (
                <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4">
                  <p className="text-xs text-dark-500">배경 음악</p>
                  <a
                    href={content.backgroundMusic}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-800 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-950/30 transition-colors"
                  >
                    배경 음악 열기
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseGuide({ content }: { content: PhaseBoardContent }) {
  if (!content.guideText?.trim()) {
    return null;
  }

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-dark-200">진행 가이드</h3>
        <span className="rounded-full border border-dark-700 px-2 py-0.5 text-[11px] text-dark-400">
          {content.badge}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-dark-300 whitespace-pre-line">{content.guideText}</p>
    </div>
  );
}

/** 다음 엔딩 단계 버튼에 표시할 문구를 현재 단계 기준으로 계산한다. */
function endingAdvanceLabel(stage: EndingStage): string {
  if (stage === "personal") {
    return "개인 엔딩 공개";
  }

  if (stage === "author-notes") {
    return "작가 노트 공개";
  }

  return "엔딩 공개 완료";
}

/** GM이 현재 분기의 개인 엔딩을 캐릭터별 토글로 확인하는 패널이다. */
function PersonalEndingOverview({
  game,
  branch,
}: {
  game: GamePackage;
  branch?: GamePackage["ending"]["branches"][number];
}) {
  const endings = resolveBranchPersonalEndings(branch);

  if (endings.length === 0) {
    return null;
  }

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-dark-200">개인 엔딩</h3>
        <span className="text-xs text-dark-500">{endings.length}개</span>
      </div>

      <div className="space-y-2">
        {endings.map((ending) => {
          const player = game.players.find((item) => item.id === ending.playerId);
          return (
            <details key={ending.playerId} className="rounded-xl border border-dark-800 bg-dark-950/60 p-4">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-dark-100">{player?.name || "(이름 없음)"}</p>
                  {ending.title && <p className="text-xs text-mystery-500 mt-1">{ending.title}</p>}
                </div>
                <span className="text-xs text-dark-500">열기</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-dark-300 whitespace-pre-line">{ending.text}</p>
            </details>
          );
        })}
      </div>
    </div>
  );
}

/** GM 전용 작가 노트를 보기 좋은 카드 목록으로 출력한다. */
function AuthorNotesOverview({ game }: { game: GamePackage }) {
  const notes = game.ending.authorNotes.filter((note) => note.title.trim() || note.content.trim());

  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-dark-200">작가 노트</h3>
        <span className="text-xs text-dark-500">{notes.length}개</span>
      </div>

      <div className="space-y-3">
        {notes.map((note) => (
          <div key={note.id} className="rounded-xl border border-dark-800 bg-dark-950/60 p-4 space-y-2">
            <p className="text-sm font-medium text-mystery-300">{note.title || "제목 없음"}</p>
            <p className="text-sm leading-relaxed text-dark-300 whitespace-pre-line">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function advanceLabel(phase: string, maxRound: number): string {
  if (phase === "lobby") return "게임 시작";
  if (phase === "opening") return "Round 1 시작";
  if (phase.startsWith("round-")) {
    const n = parseInt(phase.split("-")[1]);
    return n >= maxRound ? "투표 시작" : `Round ${n + 1} 시작`;
  }
  if (phase === "vote") return "결과 공개";
  return "";
}

/**
 * 오프닝 페이즈에서 모두가 같은 기준으로 보는 제한시간을 보여준다.
 * 오프닝은 별도 서브페이즈가 없으므로 시작 시각만 있으면 새로고침 후에도 이어서 계산된다.
 */
function OpeningTimerCard({
  sharedState,
  rules,
}: {
  sharedState: SharedState;
  rules: GameRules;
}) {
  const timerSnapshot = getSessionTimerSnapshot(sharedState, rules);
  const [secondsLeft, setSecondsLeft] = useState(() => (
    timerSnapshot
      ? getRemainingSeconds(timerSnapshot.startedAt, timerSnapshot.durationSeconds)
      : 0
  ));

  useEffect(() => {
    if (!timerSnapshot) {
      setSecondsLeft(0);
      return;
    }

    setSecondsLeft(getRemainingSeconds(timerSnapshot.startedAt, timerSnapshot.durationSeconds));
    const intervalId = window.setInterval(() => {
      setSecondsLeft(getRemainingSeconds(timerSnapshot.startedAt, timerSnapshot.durationSeconds));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timerSnapshot?.durationSeconds, timerSnapshot?.startedAt]);

  if (!timerSnapshot) {
    return null;
  }

  const progress = timerSnapshot.durationSeconds > 0
    ? (secondsLeft / timerSnapshot.durationSeconds) * 100
    : 0;
  const isExpired = secondsLeft === 0;

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-dark-300">{timerSnapshot.label}</h3>
          <p className="mt-1 text-xs text-dark-500">오프닝 안내와 공통 화면 확인 시간을 기준으로 잡습니다.</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-semibold ${isExpired ? "text-red-300" : "text-mystery-300"}`}>
            {formatTimerSeconds(secondsLeft)}
          </p>
          <p className="mt-1 text-[11px] text-dark-500">
            {isExpired ? "시간 종료" : `${Math.ceil(secondsLeft / 60)}분 이내`}
          </p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-dark-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isExpired ? "bg-red-500" : "bg-mystery-500"}`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

function PhaseTimer({
  phase,
  currentSubPhase,
  rules,
  onAdvanceRound,
  onSubPhaseChange,
  advancing,
}: {
  phase: string;
  currentSubPhase?: string;
  rules: GameRules;
  onAdvanceRound: () => Promise<boolean>;
  onSubPhaseChange: (sub: ActiveSubPhase) => Promise<boolean>;
  advancing: boolean;
}) {
  const roundNum = phase.startsWith("round-") ? parseInt(phase.split("-")[1]) : 0;
  const maxRound = rules?.roundCount ?? 4;
  const isRound = roundNum > 0;

  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);

  const subPhaseRef = useRef<ActiveSubPhase>(normalizeSubPhase(currentSubPhase));
  const autoAdvanceRef = useRef(false);
  const resumeTimerAfterSyncRef = useRef(false);

  const subPhase = normalizeSubPhase(currentSubPhase);

  useEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);

  function getDuration(type: ActiveSubPhase): number {
    const cfg = rules?.phases?.find((p) => p.type === type);
    return (cfg?.durationMinutes ?? 10) * 60;
  }

  async function doAdvance() {
    const sp = subPhaseRef.current;
    const idx = SUB_PHASE_ORDER.indexOf(sp);
    if (idx < SUB_PHASE_ORDER.length - 1) {
      const next = SUB_PHASE_ORDER[idx + 1];
      resumeTimerAfterSyncRef.current = autoAdvanceRef.current;
      const advanced = await onSubPhaseChange(next);
      if (!advanced) {
        resumeTimerAfterSyncRef.current = false;
      }
    } else {
      resumeTimerAfterSyncRef.current = false;
      await onAdvanceRound();
    }
  }

  useEffect(() => {
    if (!isRound) {
      setSecondsLeft(0);
      setTimerRunning(false);
      return;
    }

    const nextSubPhase = normalizeSubPhase(currentSubPhase);
    subPhaseRef.current = nextSubPhase;
    setSecondsLeft(getDuration(nextSubPhase));
    setTimerRunning(resumeTimerAfterSyncRef.current);
    resumeTimerAfterSyncRef.current = false;
  }, [currentSubPhase, isRound, phase, rules]);

  // 카운트다운
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setTimerRunning(false);
          if (autoAdvanceRef.current) setTimeout(() => { void doAdvance(); }, 500);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, subPhase]);

  if (!isRound) return null;

  const totalSeconds = getDuration(subPhase);
  const progress = totalSeconds > 0 ? (secondsLeft / totalSeconds) * 100 : 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpired = secondsLeft === 0;
  const isLastSubPhase = subPhase === "discussion";

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-dark-300">페이즈 타이머</h3>
        <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="rounded accent-mystery-500"
          />
          자동 넘김
        </label>
      </div>

      {/* Sub-phase 진행 표시 */}
      <div className="flex gap-1">
        {SUB_PHASE_ORDER.map((sp) => {
          const idx = SUB_PHASE_ORDER.indexOf(subPhase);
          const spIdx = SUB_PHASE_ORDER.indexOf(sp);
          const isDone = spIdx < idx;
          const isCurrent = sp === subPhase;
          return (
            <div
              key={sp}
              className={`flex-1 py-1 rounded text-xs text-center border ${
                isCurrent
                  ? "border-mystery-600 bg-mystery-900/40 text-mystery-300 font-medium"
                  : isDone
                  ? "border-dark-700 bg-dark-800 text-dark-600 line-through"
                  : "border-dark-700 text-dark-700"
              }`}
            >
              {SUB_PHASE_LABELS[sp]}
            </div>
          );
        })}
      </div>

      {/* 카운트다운 */}
      <div className="text-center py-1">
        <div
          className={`text-5xl font-mono font-bold tabular-nums ${
            isExpired ? "text-red-400 animate-pulse" : timerRunning ? "text-dark-50" : "text-dark-400"
          }`}
        >
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
        <p className="text-xs text-dark-600 mt-1">
          {SUB_PHASE_LABELS[subPhase]} — {Math.round(getDuration(subPhase) / 60)}분 배정
        </p>
      </div>

      {/* 진행 바 */}
      <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-mystery-600 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 컨트롤 */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (secondsLeft === 0) {
              setSecondsLeft(getDuration(subPhase));
              setTimerRunning(true);
            } else {
              setTimerRunning((r) => !r);
            }
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            timerRunning
              ? "bg-dark-700 hover:bg-dark-600 text-dark-200"
              : "bg-mystery-800 hover:bg-mystery-700 text-mystery-100 border border-mystery-700"
          }`}
        >
          {timerRunning ? "⏸ 일시정지" : isExpired ? "↺ 재시작" : "▶ 시작"}
        </button>
        <button
            onClick={() => { void doAdvance(); }}
            disabled={advancing}
            className="px-4 py-2 text-sm rounded-lg border border-dark-600 text-dark-300 hover:bg-dark-800 transition-colors disabled:opacity-40"
          >
          {isLastSubPhase
            ? roundNum >= maxRound
              ? "투표 →"
              : `R${roundNum + 1} 시작 →`
            : "다음 →"}
        </button>
      </div>

      {isExpired && (
        <p className="text-xs text-red-400 text-center">
          ⏰ {SUB_PHASE_LABELS[subPhase]} 시간 종료
          {!autoAdvance && " — 다음 페이즈로 이동하세요"}
        </p>
      )}
    </div>
  );
}

function isLocalOnlyHost(hostname: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase();

  if (
    normalizedHost === "localhost"
    || normalizedHost === "127.0.0.1"
    || normalizedHost === "0.0.0.0"
    || normalizedHost === "::1"
    || normalizedHost.endsWith(".local")
  ) {
    return true;
  }

  return /^10\.\d+\.\d+\.\d+$/.test(normalizedHost)
    || /^192\.168\.\d+\.\d+$/.test(normalizedHost)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(normalizedHost);
}

// ── 세션 코드 표시 ─────────────────────────────────────────────
function SessionCode({
  sessionId,
  sessionName,
  code,
  isLobby,
  onSessionNameChange,
}: {
  sessionId: string;
  sessionName: string;
  code: string;
  isLobby: boolean;
  onSessionNameChange: (nextSessionName: string) => Promise<void>;
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [publicOrigin, setPublicOrigin] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(isLobby);
  const [draftSessionName, setDraftSessionName] = useState(sessionName);
  const [savingSessionName, setSavingSessionName] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { origin, hostname } = window.location;
    setPublicOrigin(isLocalOnlyHost(hostname) ? null : origin);
  }, []);

  useEffect(() => {
    setIsExpanded(isLobby);
  }, [isLobby]);

  useEffect(() => {
    setDraftSessionName(sessionName);
  }, [sessionName]);

  const fetchServerInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/server-info");
      if (!res.ok) return;
      const data = await res.json();
      setTunnelUrl(data.tunnelUrl ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isLobby || publicOrigin || tunnelUrl) return;

    void fetchServerInfo();

    const id = setInterval(() => {
      void fetchServerInfo();
    }, 5000);

    return () => clearInterval(id);
  }, [fetchServerInfo, isLobby, publicOrigin, tunnelUrl]);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  async function saveSessionName() {
    const normalizedSessionName = draftSessionName.trim().slice(0, 40);
    if (!normalizedSessionName || normalizedSessionName === sessionName) {
      return;
    }

    setSavingSessionName(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_session_name",
          sessionName: normalizedSessionName,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "방 제목 저장 실패");
        return;
      }

      const data = await res.json() as { session?: { sessionName?: string } };
      const nextSessionName = data.session?.sessionName ?? normalizedSessionName;
      setDraftSessionName(nextSessionName);
      await onSessionNameChange(nextSessionName);
    } finally {
      setSavingSessionName(false);
    }
  }

  const joinUrl = publicOrigin
    ? `${publicOrigin}/join/${code}`
    : tunnelUrl
      ? `${tunnelUrl}/join/${code}`
      : null;

  if (!isLobby && !isExpanded) {
    return (
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-dark-500">현재 방</p>
          <p className="text-sm font-medium text-dark-100">{sessionName}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="rounded-lg border border-dark-700 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
        >
          코드 확인
        </button>
      </div>
    );
  }

  return (
    <div className="bg-dark-900 border border-mystery-800 rounded-2xl p-5 text-center space-y-3">
      <div className="flex items-start justify-between gap-3 text-left">
        <div>
          <p className="text-xs text-dark-500">플레이어 참가 코드</p>
          {!isLobby ? (
            <p className="mt-1 text-xs text-dark-600">진행 중에는 필요할 때만 다시 펼쳐 확인합니다.</p>
          ) : null}
        </div>
        {!isLobby ? (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="rounded-lg border border-dark-700 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            접기
          </button>
        ) : null}
      </div>
      <div className="space-y-2 text-left">
        <label className="text-xs text-dark-500" htmlFor={`session-name-${sessionId}`}>
          방 제목
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`session-name-${sessionId}`}
            type="text"
            value={draftSessionName}
            onChange={(event) => setDraftSessionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveSessionName();
              }
            }}
            maxLength={40}
            className="flex-1 rounded-lg border border-dark-700 bg-dark-950 px-3 py-2 text-sm text-dark-100 outline-none transition focus:border-mystery-500"
            placeholder="방 제목 입력"
          />
          <button
            type="button"
            onClick={() => { void saveSessionName(); }}
            disabled={savingSessionName || draftSessionName.trim().length === 0 || draftSessionName.trim() === sessionName}
            className="rounded-lg border border-dark-700 px-3 py-2 text-xs font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50 disabled:opacity-50"
          >
            {savingSessionName ? "저장 중…" : "이름 저장"}
          </button>
        </div>
      </div>
      <p className="text-5xl font-mono font-black tracking-widest text-mystery-300">
        {code}
      </p>
      <button
        onClick={copyCode}
        className="text-sm px-4 py-2 rounded-lg bg-mystery-800 hover:bg-mystery-700 text-mystery-200 border border-mystery-700 transition-colors"
      >
        {codeCopied ? "복사됨" : "코드 복사"}
      </button>

      {joinUrl ? (
        <div className="border-t border-dark-800 pt-3 space-y-2">
          <p className="text-xs text-dark-500">참가 링크</p>
          <p className="text-xs text-emerald-400 font-mono break-all">{joinUrl}</p>
          <button
            onClick={() => copyUrl(joinUrl)}
            className="w-full text-sm px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 transition-colors"
          >
            {urlCopied ? "복사됨" : "링크 복사"}
          </button>
        </div>
      ) : (
        <div className="border-t border-dark-800 pt-3">
          <p className="text-xs text-dark-600 text-center">
            참가 링크 없음 —{" "}
            <span className="text-dark-500">
              <code>npm run dev:tunnel</code> 로 시작하면 활성화
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── 플레이어 슬롯 카드 ──────────────────────────────────────────
function SlotCard({
  slot,
  playerName,
  unlocking,
  onUnlock,
}: {
  slot: CharacterSlot;
  playerName: string;
  unlocking: boolean;
  onUnlock: (playerId: string) => void;
}) {
  return (
    <div
      className={`border rounded-xl p-4 space-y-3 transition-colors ${
        slot.isLocked
          ? "border-mystery-700 bg-mystery-950/20"
          : "border-dark-700 bg-dark-900/60"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-dark-100 text-sm">{playerName}</p>
          {slot.isLocked ? (
            <p className="text-xs text-mystery-400 mt-0.5">
              {slot.playerName} 참가 중
            </p>
          ) : (
            <p className="text-xs text-dark-600 mt-0.5">대기 중…</p>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            slot.isLocked
              ? "border-mystery-700 text-mystery-400"
              : "border-dark-700 text-dark-600"
          }`}
        >
          {slot.isLocked ? "참가" : "미참가"}
        </span>
      </div>

      {slot.isLocked && (
        <button
          type="button"
          onClick={() => onUnlock(slot.playerId)}
          disabled={unlocking}
          className="w-full rounded-lg border border-orange-900/50 px-3 py-2 text-xs text-orange-300 hover:bg-orange-950/20 transition-colors disabled:opacity-50"
        >
          {unlocking ? "해제 중…" : "재참가 허용"}
        </button>
      )}
    </div>
  );
}

// ── 이벤트 로그 ─────────────────────────────────────────────────
function EventLog({ entries }: { entries: GameSession["sharedState"]["eventLog"] }) {
  const labels: Record<string, string> = {
    phase_changed: "페이즈",
    card_received: "획득",
    card_transferred: "양도",
    clue_revealed: "공개",
    player_joined: "참가",
    system: "시스템",
  };
  return (
    <div className="h-48 overflow-y-auto space-y-1 p-3 bg-dark-950 rounded-lg border border-dark-800">
      {[...entries].reverse().map((e) => (
        <div key={e.id} className="flex gap-2 text-xs text-dark-400">
          <span className="shrink-0 text-dark-600">[{labels[e.type] ?? "기록"}]</span>
          <span className="truncate">{e.message}</span>
          <span className="shrink-0 text-dark-700 ml-auto">
            {new Date(e.timestamp).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-dark-700 text-xs text-center py-4">로그 없음</p>
      )}
    </div>
  );
}

/**
 * 실수 비용이 큰 단계 전환은 한 번 더 확인한다.
 * 오프닝 시작은 인원 정보를, 최종 투표 진입은 경고 문구를 같이 보여준다.
 */
function PhaseAdvanceConfirmModal({
  kind,
  joinedPlayerCount,
  totalPlayerCount,
  onConfirm,
  onCancel,
  confirming,
}: {
  kind: SessionAdvanceConfirmKind;
  joinedPlayerCount: number;
  totalPlayerCount: number;
  onConfirm: (options: { fillMissingWithAi: boolean }) => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const isFull = joinedPlayerCount >= totalPlayerCount;
  const isOpening = kind === "opening";
  const missingPlayerCount = Math.max(0, totalPlayerCount - joinedPlayerCount);
  const [fillMissingWithAi, setFillMissingWithAi] = useState(false);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-dark-950/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-5 shadow-2xl">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-mystery-400/70">
            {isOpening ? "Opening Check" : "Vote Check"}
          </p>
          <h2 className="text-xl font-semibold text-dark-50">
            {isOpening ? "오프닝을 시작할까요?" : "최종 투표를 시작할까요?"}
          </h2>
          <p className="text-sm leading-6 text-dark-300">
            {isOpening
              ? "현재 참가 중인 인원을 확인한 뒤 오프닝으로 넘어갑니다."
              : "투표를 시작하면 전원 투표가 끝난 뒤 바로 엔딩 공개로 이어집니다."}
          </p>
        </div>

        {isOpening ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-dark-800 bg-dark-950/60 p-4">
              <p className="text-xs text-dark-500">현재 참가 인원</p>
              <p className="mt-2 text-3xl font-bold text-mystery-300">
                {joinedPlayerCount}
                <span className="ml-2 text-lg font-medium text-dark-500">/ {totalPlayerCount}명</span>
              </p>
              <p className={`mt-3 text-sm ${isFull ? "text-emerald-300" : "text-amber-300"}`}>
                {isFull
                  ? "설정된 인원이 모두 입장했습니다."
                  : "설정된 인원보다 적습니다. 이 상태로 시작할지 다시 확인해주세요."}
              </p>
            </div>

            {!isFull ? (
              <label className="flex items-start gap-3 rounded-xl border border-dark-800 bg-dark-950/60 p-4 text-sm text-dark-200">
                <input
                  type="checkbox"
                  checked={fillMissingWithAi}
                  onChange={(event) => setFillMissingWithAi(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-dark-600 bg-dark-950 text-mystery-500 focus:ring-mystery-500"
                />
                <span className="leading-6">
                  부족한 인원 {missingPlayerCount}명을 AI 플레이어로 채우기
                </span>
              </label>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/10 p-4">
            <p className="text-sm leading-6 text-amber-200">
              이번 투표는 최종 판정으로 이어집니다. 준비가 되었다면 투표를 시작하세요.
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-xl border border-dark-700 px-4 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ fillMissingWithAi })}
            disabled={confirming}
            className="flex-1 rounded-xl bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-50"
          >
            {confirming ? "진행 중…" : isOpening ? "확인하고 시작" : "확인하고 투표 시작"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export default function GMDashboard({
  game,
  initialSession,
  initialSessionSummaries,
  autoCreateSession = false,
}: GMDashboardProps) {
  const router = useRouter();
  const [session, setSession] = useState<GameSession | null>(initialSession);
  const [sessionSummaries, setSessionSummaries] = useState<GameSessionSummary[]>(initialSessionSummaries);
  const [creating, setCreating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advancingEndingStage, setAdvancingEndingStage] = useState(false);
  const [revealingVote, setRevealingVote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unlockingPlayerId, setUnlockingPlayerId] = useState<string | null>(null);
  const [selectedArrestPlayerId, setSelectedArrestPlayerId] = useState("");
  const [accessPromptSessionId, setAccessPromptSessionId] = useState<string | null>(null);
  const [accessPromptCode, setAccessPromptCode] = useState("");
  const [accessPromptError, setAccessPromptError] = useState<string | null>(null);
  const [verifyingSessionId, setVerifyingSessionId] = useState<string | null>(null);
  const [advanceConfirmKind, setAdvanceConfirmKind] = useState<SessionAdvanceConfirmKind | null>(null);
  const hasAutoCreatedSessionRef = useRef(false);
  const accessPromptSession = sessionSummaries.find((item) => item.id === accessPromptSessionId) ?? null;

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    setSessionSummaries(initialSessionSummaries);
    void refreshSessionSummaries(initialSession?.id);
  }, [initialSession?.id, initialSessionSummaries]);

  useEffect(() => {
    if (!session) {
      setAdvanceConfirmKind(null);
      return;
    }

    const nextConfirmKind = getAdvanceConfirmKind(session, game);
    if (advanceConfirmKind && nextConfirmKind !== advanceConfirmKind) {
      setAdvanceConfirmKind(null);
    }
  }, [advanceConfirmKind, game, session]);

  /**
   * 현재 게임의 세션 선택 URL을 일관된 형태로 만든다.
   */
  function buildSessionPath(sessionId?: string): string {
    return sessionId ? `/play/${game.id}?session=${sessionId}` : `/play/${game.id}`;
  }

  /**
   * 현재 게임의 활성 세션 목록을 다시 읽고,
   * 필요하면 특정 세션을 현재 선택 세션으로 맞춘다.
   */
  async function refreshSessionSummaries(preferredSessionId?: string) {
    try {
      const res = await fetch(`/api/sessions?gameId=${game.id}`);
      if (!res.ok) {
        return;
      }

      const data = await res.json() as { sessions?: GameSessionSummary[] };
      const nextSummaries = data.sessions ?? [];
      setSessionSummaries(nextSummaries);

      if (preferredSessionId) {
        const preferred = nextSummaries.find((item) => item.id === preferredSessionId);
        if (preferred) {
          return;
        }
      }

      const currentSessionMissingFromList = session
        ? !nextSummaries.some((item) => item.id === session.id)
        : false;

      if (currentSessionMissingFromList) {
        setSession(null);
        router.replace(buildSessionPath());
        return;
      }
    } catch {}
  }

  // 폴링 fallback — SSE가 프록시에 버퍼링될 때 3초마다 세션 상태 동기화
  useEffect(() => {
    if (!session) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setSession((prev) => (prev ? { ...prev, ...data.session } : prev));
        await refreshSessionSummaries(session.id);
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [session?.id]);

  // SSE 구독
  useSSE(
    session ? `/api/sessions/${session.id}/events` : null,
    {
      session_update: useCallback(
        (data: unknown) => {
          const d = data as { sharedState: SharedState };
          setSession((prev) => prev ? { ...prev, sharedState: d.sharedState } : prev);
        },
        []
      ),
      session_deleted: useCallback(() => {
        setSession(null);
        router.replace(`/play/${game.id}`);
      }, [router, game.id]),
    }
  );

  async function createSession() {
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: game.id }),
      });
      if (res.ok) {
        const { session: created } = await res.json() as { session: GameSession };
        setSession(created);
        await refreshSessionSummaries(created.id);
        router.push(buildSessionPath(created.id));
      } else {
        const err = await res.json();
        alert(err.error ?? "세션 생성 실패");
      }
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!autoCreateSession || session || creating || hasAutoCreatedSessionRef.current) {
      return;
    }

    hasAutoCreatedSessionRef.current = true;
    void createSession();
  }, [autoCreateSession, session, creating]);

  async function openSessionFromList(item: GameSessionSummary) {
    if (item.canResumeDirectly) {
      router.push(buildSessionPath(item.id));
      return;
    }

    setAccessPromptSessionId(item.id);
    setAccessPromptCode("");
    setAccessPromptError(null);
  }

  async function verifySessionAccess(sessionId: string) {
    const sessionCode = accessPromptCode.trim();
    if (!sessionCode) {
      setAccessPromptError("세션 코드를 입력해주세요.");
      return;
    }

    setVerifyingSessionId(sessionId);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionCode }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        setAccessPromptError(errorBody.error ?? "세션 코드 확인 실패");
        return;
      }

      const data = await response.json() as { entryPath?: string };

      setAccessPromptSessionId(null);
      setAccessPromptCode("");
      setAccessPromptError(null);
      await refreshSessionSummaries(sessionId);
      router.push(data.entryPath ?? buildSessionPath(sessionId));
    } finally {
      setVerifyingSessionId(null);
    }
  }

  async function advancePhase(options?: { skipConfirm?: boolean; fillMissingWithAi?: boolean }) {
    if (!session) return false;
    const confirmKind = getAdvanceConfirmKind(session, game);
    if (!options?.skipConfirm && confirmKind) {
      setAdvanceConfirmKind(confirmKind);
      return false;
    }

    setAdvancing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "advance_phase",
          fillMissingWithAi: options?.fillMissingWithAi === true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "페이즈 전환 실패");
        return false;
      }

      const data = await res.json();
      setSession((prev) =>
        prev ? { ...prev, sharedState: data.session.sharedState } : prev
      );
      return true;
    } catch {
      alert("페이즈 전환 중 오류가 발생했습니다.");
      return false;
    } finally {
      setAdvancing(false);
    }
  }

  async function confirmAdvancePhase(options: { fillMissingWithAi: boolean }) {
    const ok = await advancePhase({
      skipConfirm: true,
      fillMissingWithAi: options.fillMissingWithAi,
    });
    if (ok) {
      setAdvanceConfirmKind(null);
    }
  }

  async function advanceSubPhase(sub: ActiveSubPhase) {
    if (!session) return false;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_subphase", subPhase: sub }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "세부 페이즈 전환 실패");
        return false;
      }

      const data = await res.json();
      setSession((prev) =>
        prev ? { ...prev, sharedState: data.session.sharedState } : prev
      );
      return true;
    } catch {
      alert("세부 페이즈 전환 중 오류가 발생했습니다.");
      return false;
    } finally {
      setAdvancing(false);
    }
  }

  async function forceRevealVotes() {
    if (!session) return;
    setRevealingVote(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/vote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrestedPlayerId: selectedArrestPlayerId || undefined }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "결과 공개 실패");
        return;
      }

      const data = await res.json();
      if (data.session) {
        setSession((prev) => (
          prev
            ? {
                ...prev,
                sharedState: data.session.sharedState ?? prev.sharedState,
                pendingArrestOptions: data.session.pendingArrestOptions ?? [],
              }
            : prev
        ));
      }
    } finally {
      setRevealingVote(false);
    }
  }

  async function advanceEndingStage() {
    if (!session) return;
    setAdvancingEndingStage(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance_ending_stage" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "엔딩 단계 전환 실패");
        return;
      }

      const data = await res.json();
      setSession((prev) =>
        prev ? { ...prev, sharedState: data.session.sharedState } : prev
      );
    } catch {
      alert("엔딩 단계 전환 중 오류가 발생했습니다.");
    } finally {
      setAdvancingEndingStage(false);
    }
  }

  async function deleteSession() {
    if (!session) return;
    if (!confirm("세션 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      setSession(null);
      await refreshSessionSummaries();
    } finally {
      setDeleting(false);
    }
    // session_deleted SSE 이벤트도 함께 전달됨
  }

  async function handleSessionNameChange(nextSessionName: string) {
    if (!session) return;

    setSession((prev) => (
      prev
        ? {
            ...prev,
            sessionName: nextSessionName,
          }
        : prev
    ));

    await refreshSessionSummaries(session.id);
  }

  async function unlockSlot(playerId: string) {
    if (!session) return;

    const slot = session.sharedState.characterSlots.find((item) => item.playerId === playerId);
    if (!slot?.isLocked) return;

    const targetName = game.players.find((item) => item.id === playerId)?.name ?? "해당 캐릭터";
    if (!confirm(`${targetName} 슬롯 잠금을 해제하고 다시 참가할 수 있게 하시겠습니까?`)) return;

    setUnlockingPlayerId(playerId);

    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock_slot", playerId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "슬롯 잠금 해제 실패");
        return;
      }

      const data = await res.json();
      setSession((prev) =>
        prev
          ? {
              ...prev,
              sharedState: data.session.sharedState,
            }
          : prev
      );
    } catch {
      alert("슬롯 잠금 해제 중 오류가 발생했습니다.");
    } finally {
      setUnlockingPlayerId(null);
    }
  }

  const phase = session?.sharedState.phase ?? "lobby";
  const totalPlayers = session?.sharedState.characterSlots.filter((s) => s.isLocked).length ?? 0;
  const voteCount = session?.sharedState.voteCount ?? 0;
  const phaseContent = session ? getPhaseBoardContent(game, session.sharedState) : null;
  const currentEndingStage = normalizeEndingStage(session?.sharedState.endingStage);
  const activeEndingBranch = session
    ? resolveActiveEndingBranch(game, session.sharedState.voteReveal)
    : undefined;
  const nextEndingStage = session
    ? getNextEndingStage(game, currentEndingStage, session.sharedState.voteReveal)
    : null;
  const currentSubPhaseLabel =
    session && phase.startsWith("round-")
      ? SUB_PHASE_LABELS[normalizeSubPhase(session.sharedState.currentSubPhase)]
      : null;
  const phaseSteps = [
    "lobby",
    "opening",
    ...Array.from({ length: game.rules?.roundCount ?? 4 }, (_, index) => `round-${index + 1}`),
    "vote",
    "ending",
  ];
  const pendingArrestOptions = session?.pendingArrestOptions ?? [];

  useEffect(() => {
    if (pendingArrestOptions.length === 0) {
      setSelectedArrestPlayerId("");
      return;
    }

    setSelectedArrestPlayerId((prev) => (
      pendingArrestOptions.includes(prev) ? prev : pendingArrestOptions[0]
    ));
  }, [pendingArrestOptions]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-mystery-500 mb-1">GM 대시보드</p>
          <h1 className="text-2xl font-bold text-dark-50">{game.title}</h1>
          <p className="text-sm text-dark-500 mt-1">
            {(game.players ?? []).length}명 · {DIFFICULTY_LABELS[game.settings.difficulty] ?? game.settings.difficulty} · {game.settings.estimatedDuration}분
          </p>
        </div>
        {session && (
          <div className="text-right">
            <p className="text-xs text-dark-500">현재 페이즈</p>
            <p className="text-lg font-bold text-mystery-300">
              {phaseLabel(phase)}
              {currentSubPhaseLabel ? ` · ${currentSubPhaseLabel}` : ""}
            </p>
            {phase.startsWith("round-") && (
              <p className="text-xs text-dark-500">
                Round {session.sharedState.currentRound} / {game.rules?.roundCount ?? 4}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 세션 없음 */}
      {!session ? (
        <div className="space-y-4">
          {sessionSummaries.length > 0 ? (
            <div className="rounded-[28px] border border-dark-800 bg-dark-900 p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-mystery-400/70">Session List</p>
                  <h2 className="mt-2 text-2xl font-semibold text-dark-50">들어갈 방을 고르세요</h2>
                </div>
                <button
                  onClick={createSession}
                  disabled={creating}
                  className="rounded-xl border border-mystery-600 bg-mystery-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-50"
                >
                  {creating ? "생성 중…" : "새 세션 시작"}
                </button>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {sessionSummaries.map((item) => {
                  const needsCode = !item.canResumeDirectly;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { void openSessionFromList(item); }}
                      className="rounded-2xl border border-dark-700 bg-dark-950/70 p-4 text-left transition-colors hover:border-mystery-700 hover:bg-dark-950"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-dark-50">{item.sessionName}</p>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-dark-700 px-2 py-1 text-[11px] text-dark-300">
                            {item.mode === "player-consensus" ? "GM 없음" : "GM 진행"}
                          </span>
                          {needsCode ? (
                            <span className="rounded-full border border-amber-800/60 px-2 py-1 text-[11px] text-amber-300">
                              코드 필요
                            </span>
                          ) : null}
                          <span className="rounded-full border border-dark-700 px-2 py-1 text-[11px] text-dark-400">
                            {getSessionBadgeLabel(item)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-dark-500">{formatSessionCreatedAt(item.createdAt)} 생성</p>
                      <p className="mt-3 text-sm text-dark-300">
                        {item.lockedPlayerCount} / {item.totalPlayerCount}명 참가 중
                      </p>
                      <p className="mt-4 text-xs text-dark-500">
                        {needsCode ? "코드 확인 후 입장" : "바로 이어서 열기"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-dark-800 bg-dark-900/70 px-6 py-16 text-center">
              <p className="text-xs uppercase tracking-[0.18em] text-mystery-400/70">Session Start</p>
              <h2 className="mt-3 text-2xl font-semibold text-dark-50">열린 세션이 아직 없습니다</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-dark-300">
                첫 번째 방을 만들면 참가 코드를 바로 공유하고 바로 플레이를 시작할 수 있습니다.
              </p>
              <button
                onClick={createSession}
                disabled={creating}
                className="mt-8 px-6 py-3 bg-mystery-700 hover:bg-mystery-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {creating ? "생성 중…" : "새 세션 시작"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽: 세션 코드 + 페이즈 제어 */}
          <div className="space-y-4">
            <SessionCode
              sessionId={session.id}
              sessionName={session.sessionName}
              code={session.sessionCode}
              isLobby={phase === "lobby"}
              onSessionNameChange={handleSessionNameChange}
            />

            {/* 페이즈 제어 */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-dark-300">페이즈 제어</h3>
              <div className="flex flex-wrap gap-1.5">
                {phaseSteps.map((step) => (
                  <span
                    key={step}
                    className={`text-xs px-2 py-1 rounded-full border ${
                      phase === step
                        ? "border-mystery-600 bg-mystery-800/40 text-mystery-300"
                        : "border-dark-700 text-dark-600"
                    }`}
                  >
                    {phaseLabel(step)}
                  </span>
                ))}
              </div>
              {phase === "vote" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-400">투표 현황</span>
                    <span className="text-mystery-300 font-medium">{voteCount} / {totalPlayers}명</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-mystery-600 rounded-full transition-all duration-500"
                      style={{ width: `${totalPlayers > 0 ? (voteCount / totalPlayers) * 100 : 0}%` }}
                    />
                  </div>
                  {pendingArrestOptions.length > 0 ? (
                    <div className="space-y-3 rounded-xl border border-yellow-900/50 bg-yellow-950/10 p-3">
                      <div>
                        <p className="text-sm font-medium text-yellow-300">최다 득표 동률</p>
                        <p className="text-xs text-dark-500 mt-1">최종 검거 대상을 선택해야 엔딩으로 넘어갑니다.</p>
                      </div>
                      <select
                        value={selectedArrestPlayerId}
                        onChange={(e) => setSelectedArrestPlayerId(e.target.value)}
                        className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-200 text-sm focus:outline-none focus:ring-1 focus:ring-mystery-500"
                      >
                        {pendingArrestOptions.map((playerId) => {
                          const player = game.players.find((item) => item.id === playerId);
                          return (
                            <option key={playerId} value={playerId}>
                              {player?.name || "(이름 없음)"}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        onClick={forceRevealVotes}
                        disabled={revealingVote || !selectedArrestPlayerId}
                        className="w-full py-2.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {revealingVote ? "확정 중…" : "최종 검거 대상 확정"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={forceRevealVotes}
                        disabled={revealingVote}
                        className="w-full py-2.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {revealingVote ? "공개 중…" : `강제 결과 공개 (${voteCount}/${totalPlayers}표)`}
                      </button>
                      <p className="text-xs text-dark-600 text-center">전원 투표 시 자동 공개됩니다.</p>
                    </>
                  )}
                </div>
              ) : phase !== "ending" ? (
                <button
                  onClick={() => {
                    void advancePhase();
                  }}
                  disabled={advancing}
                  className="w-full py-2.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {advancing ? "처리 중…" : advanceLabel(phase, game.rules?.roundCount ?? 4)}
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-dark-800 bg-dark-950/50 px-3 py-3 text-sm text-dark-300">
                    현재 단계: <span className="font-medium text-mystery-300">{ENDING_STAGE_LABELS[currentEndingStage]}</span>
                  </div>
                  {nextEndingStage ? (
                    <button
                      onClick={advanceEndingStage}
                      disabled={advancingEndingStage}
                      className="w-full py-2.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {advancingEndingStage ? "처리 중…" : endingAdvanceLabel(nextEndingStage)}
                    </button>
                  ) : (
                    <div className="text-center py-2 text-sm text-dark-500">모든 엔딩 단계 공개 완료</div>
                  )}
                </div>
              )}
            </div>

            {/* 페이즈 타이머 */}
            <OpeningTimerCard
              sharedState={session.sharedState}
              rules={game.rules}
            />

            <PhaseTimer
              phase={phase}
              currentSubPhase={session.sharedState.currentSubPhase}
              rules={game.rules}
              onAdvanceRound={advancePhase}
              onSubPhaseChange={advanceSubPhase}
              advancing={advancing}
            />

            {/* 페이즈 안내 */}
            {phaseContent && <PhaseGuide content={phaseContent} />}

            {/* 세션 관리 */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-dark-300">세션 관리</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={deleteSession}
                  disabled={deleting}
                  className="w-full py-2 text-sm text-red-400 border border-red-900/50 rounded-lg hover:bg-red-950/30 transition-colors disabled:opacity-50"
                >
                  {deleting ? "삭제 중…" : "세션 삭제"}
                </button>
              </div>
            </div>

            {/* 이벤트 로그 */}
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-dark-300">이벤트 로그</h3>
              <EventLog entries={session.sharedState.eventLog} />
            </div>
          </div>

          {/* 오른쪽: 플레이어 슬롯 */}
          <div className="lg:col-span-2 space-y-4">
            {phaseContent && <GMBoard game={game} content={phaseContent} />}
            {phase === "ending" && (currentEndingStage === "personal" || currentEndingStage === "author-notes" || currentEndingStage === "complete") && (
              <PersonalEndingOverview game={game} branch={activeEndingBranch} />
            )}
            {phase === "ending" && (currentEndingStage === "author-notes" || currentEndingStage === "complete") && (
              <AuthorNotesOverview game={game} />
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-dark-300">
                플레이어 슬롯 (
                {session.sharedState.characterSlots.filter((s) => s.isLocked).length} /{" "}
                {session.sharedState.characterSlots.length} 참가)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {session.sharedState.characterSlots.map((slot) => {
                const character = (game.players ?? []).find((p) => p.id === slot.playerId);
                return (
                  <SlotCard
                    key={slot.playerId}
                    slot={slot}
                    playerName={character?.name || "(이름 없음)"}
                    unlocking={unlockingPlayerId === slot.playerId}
                    onUnlock={unlockSlot}
                  />
                );
              })}
            </div>

            {/* 게임 진행 안내 */}
            {phase === "lobby" && (
              <div className="border border-dark-700 rounded-xl p-4 text-sm text-dark-500 space-y-1">
                <p className="font-medium text-dark-400">진행 방법</p>
                <p>1. 플레이어들이 참가 코드로 입장합니다.</p>
                <p>2. 모두 입장하면 <strong className="text-dark-300">게임 시작</strong>을 눌러 오프닝을 진행합니다.</p>
                <p>3. 라운드마다 단서를 획득하고 토론합니다.</p>
                <p>4. 투표 후 범인을 공개합니다.</p>
              </div>
            )}

          </div>
        </div>
      )}

      {accessPromptSession ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-dark-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-5 shadow-2xl">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-mystery-400/70">Session Code</p>
              <h2 className="text-xl font-semibold text-dark-50">{accessPromptSession.sessionName}</h2>
              <p className="text-sm leading-6 text-dark-300">세션 코드를 입력하세요.</p>
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={accessPromptCode}
                onChange={(event) => {
                  setAccessPromptCode(event.target.value.toUpperCase().slice(0, 6));
                  setAccessPromptError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void verifySessionAccess(accessPromptSession.id);
                  }
                }}
                maxLength={6}
                placeholder="예: ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                className="w-full rounded-2xl border border-dark-700 bg-dark-950 px-4 py-4 text-center text-3xl font-mono font-bold tracking-[0.24em] text-mystery-300 outline-none transition focus:border-mystery-500"
              />
              {accessPromptError ? (
                <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {accessPromptError}
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAccessPromptSessionId(null);
                  setAccessPromptCode("");
                  setAccessPromptError(null);
                }}
                className="flex-1 rounded-xl border border-dark-700 px-4 py-3 text-sm font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() => { void verifySessionAccess(accessPromptSession.id); }}
                disabled={accessPromptCode.length !== 6 || verifyingSessionId === accessPromptSession.id}
                className="flex-1 rounded-xl bg-mystery-700 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-mystery-600 disabled:opacity-50"
              >
                {verifyingSessionId === accessPromptSession.id ? "확인 중…" : "입장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {session && advanceConfirmKind ? (
        <PhaseAdvanceConfirmModal
          kind={advanceConfirmKind}
          joinedPlayerCount={session.sharedState.characterSlots.filter((slot) => slot.isLocked).length}
          totalPlayerCount={session.sharedState.characterSlots.length}
          onCancel={() => setAdvanceConfirmKind(null)}
          onConfirm={(options) => { void confirmAdvancePhase(options); }}
          confirming={advancing}
        />
      ) : null}
    </div>
  );
}
