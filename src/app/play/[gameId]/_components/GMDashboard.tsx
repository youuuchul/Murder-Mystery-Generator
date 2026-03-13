"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSSE } from "@/hooks/useSSE";
import type { GamePackage, GameRules, ScriptSegment } from "@/types/game";
import type { GameSession, SharedState, CharacterSlot } from "@/types/session";

interface GMDashboardProps {
  game: GamePackage;
  initialSession: GameSession | null;
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

function normalizeSubPhase(subPhase?: string): ActiveSubPhase {
  return subPhase === "discussion" || subPhase === "briefing" ? "discussion" : "investigation";
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
      narrationBlocks: game.scripts.lobby.narration
        ? [{ label: "대기실 나레이션", text: game.scripts.lobby.narration }]
        : [],
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
        ? [{ label: "오프닝 나레이션", text: game.scripts.opening.narration }]
        : [],
      guideText: game.scripts.opening.gmNote,
      videoUrl: game.scripts.opening.videoUrl,
      backgroundMusic: game.scripts.opening.backgroundMusic,
      showSharedImage: false,
    };
  }

  if (phase.startsWith("round-")) {
    const subPhase = normalizeSubPhase(sharedState.currentSubPhase);
    return {
      title: `Round ${roundNum}`,
      badge: SUB_PHASE_LABELS[subPhase],
      narrationBlocks: roundScript?.narration
        ? [{ label: `Round ${roundNum} 나레이션`, text: roundScript.narration }]
        : [],
      guideText: roundScript?.gmNote,
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
    const branchScript: ScriptSegment | undefined = sharedState.voteReveal
      ? sharedState.voteReveal.majorityCorrect
        ? game.scripts.endingSuccess
        : game.scripts.endingFail
      : undefined;
    const guideParts = [game.scripts.ending.gmNote, branchScript?.gmNote].filter(Boolean);

    return {
      title: "엔딩",
      badge: sharedState.voteReveal?.majorityCorrect ? "Success" : "Ending",
      narrationBlocks: [
        game.scripts.ending.narration
          ? { label: "공통 엔딩", text: game.scripts.ending.narration }
          : null,
        branchScript?.narration
          ? {
              label: sharedState.voteReveal?.majorityCorrect ? "검거 성공 엔딩" : "도주 성공 엔딩",
              text: branchScript.narration,
            }
          : null,
      ].filter((block): block is { label: string; text: string } => Boolean(block)),
      guideText: guideParts.length > 0 ? guideParts.join("\n\n") : undefined,
      videoUrl: branchScript?.videoUrl ?? game.scripts.ending.videoUrl,
      backgroundMusic: branchScript?.backgroundMusic ?? game.scripts.ending.backgroundMusic,
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
  const showSharedImage = content.showSharedImage ?? true;
  return (
    <div className="rounded-2xl border border-dark-800 overflow-hidden bg-[linear-gradient(145deg,rgba(51,65,85,0.18),rgba(10,14,23,0.94))]">
      <div className="border-b border-dark-800/80 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.22em] uppercase text-mystery-400/80">GM Board</p>
          <h3 className="text-xl font-bold text-dark-50 mt-1">{content.title}</h3>
        </div>
        <span className="rounded-full border border-mystery-700/60 bg-mystery-950/30 px-3 py-1 text-xs font-medium text-mystery-300">
          {content.badge}
        </span>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4 space-y-3">
          <p className="text-xs text-dark-500">페이즈 영상</p>
          <MediaPanel source={videoSource} title={content.title} />
        </div>

        <div className="space-y-4">
          {showSharedImage && (
            <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4 space-y-3">
              <p className="text-xs text-dark-500">공통 이미지 / 지도</p>
              {game.story.mapImageUrl ? (
                <img
                  src={game.story.mapImageUrl}
                  alt={`${game.title} 공통 이미지`}
                  className="w-full rounded-xl border border-dark-700 object-cover"
                />
              ) : (
                <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/60 px-4 py-8 text-center text-sm text-dark-600">
                  연결된 이미지가 없습니다.
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-dark-800 bg-dark-950/70 p-4">
            <p className="text-xs text-dark-500">배경 음악</p>
            {content.backgroundMusic ? (
              <a
                href={content.backgroundMusic}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-800 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-300 hover:bg-emerald-950/30 transition-colors"
              >
                배경 음악 열기
              </a>
            ) : (
              <p className="mt-3 text-sm text-dark-600">연결된 음악이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhaseGuide({ content }: { content: PhaseBoardContent }) {
  const hasNarration = content.narrationBlocks.length > 0;
  const hasGuide = Boolean(content.guideText?.trim());
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-dark-200">페이즈 가이드</h3>
        <span className="rounded-full border border-dark-700 px-2 py-0.5 text-[11px] text-dark-400">
          {content.badge}
        </span>
      </div>

      {hasGuide ? (
        <p className="text-sm leading-relaxed text-dark-300 whitespace-pre-line">{content.guideText}</p>
      ) : (
        <p className="text-sm text-dark-600">제작 화면의 스크립트 탭에서 이 페이즈 가이드를 입력하세요.</p>
      )}

      {hasNarration && (
        <details className="border-t border-dark-700 pt-3">
          <summary className="text-xs text-mystery-500 cursor-pointer hover:text-mystery-300 select-none">
            나레이션 보기 ▾
          </summary>
          <div className="mt-2 space-y-3">
            {content.narrationBlocks.map((block) => (
              <div key={block.label} className="rounded-lg bg-dark-800 p-3">
                <p className="text-[11px] text-dark-500">{block.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-dark-300 whitespace-pre-line">{block.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}
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

// ── 세션 코드 표시 ─────────────────────────────────────────────
function SessionCode({ code }: { code: string }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [serverIps, setServerIps] = useState<string[]>([]);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [localPort, setLocalPort] = useState("3000");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextPort = window.location.port;
    if (nextPort) {
      setLocalPort(nextPort);
      return;
    }

    setLocalPort(window.location.protocol === "https:" ? "443" : "80");
  }, []);

  const fetchServerInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/server-info");
      if (!res.ok) return;
      const data = await res.json();
      setServerIps(data.ips ?? []);
      setTunnelUrl(data.tunnelUrl ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    void fetchServerInfo();
    if (tunnelUrl) return;

    const id = setInterval(() => {
      void fetchServerInfo();
    }, 5000);

    return () => clearInterval(id);
  }, [fetchServerInfo, tunnelUrl]);

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

  const joinPath = "/join";
  const portSuffix = localPort === "80" || localPort === "443" ? "" : `:${localPort}`;

  return (
    <div className="bg-dark-900 border border-mystery-800 rounded-2xl p-5 text-center space-y-3">
      <p className="text-xs text-dark-500">플레이어 참가 코드</p>
      <p className="text-5xl font-mono font-black tracking-widest text-mystery-300">
        {code}
      </p>
      <button
        onClick={copyCode}
        className="text-sm px-4 py-2 rounded-lg bg-mystery-800 hover:bg-mystery-700 text-mystery-200 border border-mystery-700 transition-colors"
      >
        {codeCopied ? "복사됨" : "코드 복사"}
      </button>

      {/* 터널 URL (cloudflared) */}
      {tunnelUrl ? (
        <div className="border-t border-dark-800 pt-3 space-y-2">
          <p className="text-xs text-dark-500">외부 접속 URL (어떤 네트워크든 가능)</p>
          <p className="text-xs text-emerald-400 font-mono break-all">{tunnelUrl}{joinPath}</p>
          <button
            onClick={() => copyUrl(`${tunnelUrl}${joinPath}`)}
            className="w-full text-sm px-4 py-2 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 transition-colors"
          >
            {urlCopied ? "복사됨" : "URL 복사"}
          </button>
        </div>
      ) : (
        <div className="border-t border-dark-800 pt-3">
          <p className="text-xs text-dark-600 text-center">
            외부 URL 없음 —{" "}
            <span className="text-dark-500">
              <code>npm run dev:tunnel</code> 로 시작하면 활성화
            </span>
          </p>
        </div>
      )}

      {/* LAN IP */}
      <div className="border-t border-dark-800 pt-3 space-y-1">
        <p className="text-xs text-dark-600 text-center">LAN 접속 주소 (같은 Wi-Fi 필요)</p>
        {serverIps.length === 0 ? (
          <p className="text-xs text-dark-700 text-center font-mono">[IP 확인 중…]</p>
        ) : (
          serverIps.map((ip) => (
            <div key={ip} className="flex items-center justify-between px-2">
              <p className="text-xs text-dark-400 font-mono">{ip}{portSuffix}{joinPath}</p>
              <button
                onClick={() => copyUrl(`http://${ip}${portSuffix}${joinPath}`)}
                className="text-xs text-dark-600 hover:text-dark-300 transition-colors ml-2"
              >
                복사
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── 플레이어 슬롯 카드 ──────────────────────────────────────────
function SlotCard({
  slot,
  playerName,
  onDistribute,
  secretClues,
  sessionId,
}: {
  slot: CharacterSlot;
  playerName: string;
  onDistribute: () => void;
  secretClues: { id: string; title: string }[];
  sessionId: string;
}) {
  const [distributing, setDistributing] = useState(false);
  const [selectedClue, setSelectedClue] = useState("");

  async function handleDistribute() {
    if (!selectedClue) return;
    setDistributing(true);
    await fetch(`/api/sessions/${sessionId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "distribute",
        clueId: selectedClue,
        targetPlayerId: slot.playerId,
      }),
    });
    setSelectedClue("");
    setDistributing(false);
    onDistribute();
  }

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

      {/* GM 단서 배포 */}
      {slot.isLocked && secretClues.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedClue}
            onChange={(e) => setSelectedClue(e.target.value)}
            className="flex-1 bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-dark-300 text-xs focus:outline-none focus:ring-1 focus:ring-mystery-500"
          >
            <option value="">— 단서 선택 —</option>
            {secretClues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "(제목 없음)"}
              </option>
            ))}
          </select>
          <button
            onClick={handleDistribute}
            disabled={!selectedClue || distributing}
            className="text-xs px-3 py-1.5 rounded bg-mystery-800 hover:bg-mystery-700 text-mystery-200 border border-mystery-700 disabled:opacity-40 transition-colors"
          >
            배포
          </button>
        </div>
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

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export default function GMDashboard({ game, initialSession }: GMDashboardProps) {
  const [session, setSession] = useState<GameSession | null>(initialSession);
  const [creating, setCreating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [revealingVote, setRevealingVote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [endingSession, setEndingSession] = useState(false);

  const secretClues = game.clues.filter((c) => c.isSecret).map((c) => ({
    id: c.id,
    title: c.title,
  }));

  // 폴링 fallback — SSE가 프록시에 버퍼링될 때 3초마다 세션 상태 동기화
  useEffect(() => {
    if (!session) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${session.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setSession((prev) =>
          prev ? { ...prev, sharedState: data.session.sharedState } : prev
        );
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
      }, []),
    }
  );

  async function createSession() {
    setCreating(true);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: game.id }),
    });
    if (res.ok) {
      const { session: created } = await res.json();
      setSession(created);
    } else {
      const err = await res.json();
      alert(err.error ?? "세션 생성 실패");
    }
    setCreating(false);
  }

  async function advancePhase() {
    if (!session) return false;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance_phase" }),
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
    await fetch(`/api/sessions/${session.id}/vote`, { method: "PATCH" });
    setRevealingVote(false);
  }

  async function endSession() {
    if (!session) return;
    if (!confirm("세션을 강제 종료하시겠습니까? 플레이어들이 엔딩 화면으로 이동합니다.")) return;
    setEndingSession(true);
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end_session" }),
    });
    setEndingSession(false);
  }

  async function deleteSession() {
    if (!session) return;
    if (!confirm("세션 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    setDeleting(false);
    // session_deleted SSE 이벤트로 setSession(null) 처리됨
  }

  const phase = session?.sharedState.phase ?? "lobby";
  const totalPlayers = session?.sharedState.characterSlots.filter((s) => s.isLocked).length ?? 0;
  const voteCount = session?.sharedState.voteCount ?? 0;
  const phaseContent = session ? getPhaseBoardContent(game, session.sharedState) : null;
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-mystery-500 mb-1">GM 대시보드</p>
          <h1 className="text-2xl font-bold text-dark-50">{game.title}</h1>
          <p className="text-sm text-dark-500 mt-1">
            {(game.players ?? []).length}명 · {game.settings.difficulty} · {game.settings.estimatedDuration}분
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
        <div className="text-center py-20 border-2 border-dashed border-dark-700 rounded-2xl">
          <p className="text-dark-400 mb-6">아직 활성 세션이 없습니다.</p>
          <button
            onClick={createSession}
            disabled={creating}
            className="px-6 py-3 bg-mystery-700 hover:bg-mystery-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {creating ? "생성 중…" : "새 세션 시작"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 왼쪽: 세션 코드 + 페이즈 제어 */}
          <div className="space-y-4">
            <SessionCode code={session.sessionCode} />

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
                  <button
                    onClick={forceRevealVotes}
                    disabled={revealingVote}
                    className="w-full py-2.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {revealingVote ? "공개 중…" : `강제 결과 공개 (${voteCount}/${totalPlayers}표)`}
                  </button>
                  <p className="text-xs text-dark-600 text-center">전원 투표 시 자동 공개됩니다.</p>
                </div>
              ) : phase !== "ending" ? (
                <button
                  onClick={() => { void advancePhase(); }}
                  disabled={advancing}
                  className="w-full py-2.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {advancing ? "처리 중…" : advanceLabel(phase, game.rules?.roundCount ?? 4)}
                </button>
              ) : (
                <div className="text-center py-2 text-sm text-dark-500">게임 종료</div>
              )}
            </div>

            {/* 페이즈 타이머 */}
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
                {phase !== "ending" && (
                  <button
                    onClick={endSession}
                    disabled={endingSession}
                    className="w-full py-2 text-sm text-orange-300 border border-orange-900/50 rounded-lg hover:bg-orange-950/30 transition-colors disabled:opacity-50"
                  >
                    {endingSession ? "종료 중…" : "세션 강제 종료"}
                  </button>
                )}
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
                    onDistribute={() => {}}
                    secretClues={secretClues}
                    sessionId={session.id}
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
    </div>
  );
}
