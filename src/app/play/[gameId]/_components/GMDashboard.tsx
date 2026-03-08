"use client";

import { useState, useCallback, useEffect } from "react";
import { useSSE } from "@/hooks/useSSE";
import type { GamePackage } from "@/types/game";
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

// ── 페이즈 안내 패널 ────────────────────────────────────────────
function PhaseGuide({ phase, game }: { phase: string; game: GamePackage }) {
  const roundNum = phase.startsWith("round-") ? parseInt(phase.split("-")[1]) : 0;
  const roundScript = game.scripts?.rounds?.find((r) => r.round === roundNum);
  const maxRound = game.rules?.roundCount ?? 4;

  const guides: Record<string, { icon: string; title: string; steps: string[]; narration?: string }> = {
    lobby: {
      icon: "🚪",
      title: "대기실 — 입장 확인",
      steps: [
        "플레이어들에게 참가 코드를 알려주세요.",
        "모바일에서 [서버IP]:3000/join 접속 후 코드 입력",
        "전원 입장 확인 후 '게임 시작'을 눌러 오프닝으로 이동합니다.",
      ],
    },
    opening: {
      icon: "🎭",
      title: "오프닝 — 나레이션 & 자기소개",
      steps: [
        "아래 오프닝 나레이션을 천천히 읽어주세요.",
        `각 플레이어(${game.players.map((p) => p.name).join(" → ")}) 순으로 캐릭터 이름과 한 줄 자기소개를 합니다.`,
        "자기소개 후 '라운드 1 시작'을 눌러주세요.",
      ],
      narration: game.scripts?.opening?.narration,
    },
    vote: {
      icon: "🗳",
      title: "투표 페이즈",
      steps: [
        "플레이어들이 각자 휴대폰에서 범인 투표를 진행합니다.",
        "전원 투표 시 결과가 자동으로 공개됩니다.",
        "투표가 지연되면 '강제 결과 공개' 버튼을 사용하세요.",
      ],
    },
    ending: {
      icon: "🏁",
      title: "엔딩",
      steps: [
        "엔딩 나레이션을 읽어주세요.",
        "각 플레이어의 승점 조건 달성 여부를 함께 확인합니다.",
        "세션을 삭제하면 다시 새 세션을 시작할 수 있습니다.",
      ],
      narration: game.scripts?.ending?.narration,
    },
  };

  let guide = guides[phase];

  if (!guide && phase.startsWith("round-")) {
    guide = {
      icon: "🔍",
      title: `Round ${roundNum} 조사 페이즈`,
      steps: [
        "플레이어들이 장소를 탐색하고 단서를 획득합니다.",
        "필요 시 GM이 비밀 단서를 특정 플레이어에게 직접 배포할 수 있습니다.",
        roundNum < maxRound
          ? `조사·토론이 끝나면 'Round ${roundNum + 1} 시작'을 눌러주세요.`
          : "마지막 라운드입니다. 조사·토론 후 '투표 시작'을 눌러주세요.",
      ],
      narration: roundScript?.narration,
    };
  }

  if (!guide) return null;

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{guide.icon}</span>
        <h3 className="text-sm font-semibold text-dark-200">{guide.title}</h3>
      </div>
      <ol className="space-y-1.5">
        {guide.steps.map((step, i) => (
          <li key={i} className="flex gap-2 text-xs text-dark-400">
            <span className="shrink-0 text-mystery-600 font-bold">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {guide.narration && (
        <details className="border-t border-dark-700 pt-3">
          <summary className="text-xs text-mystery-500 cursor-pointer hover:text-mystery-300 select-none">
            나레이션 보기 ▾
          </summary>
          <p className="mt-2 text-xs text-dark-300 leading-relaxed whitespace-pre-line bg-dark-800 rounded-lg p-3">
            {guide.narration}
          </p>
        </details>
      )}
    </div>
  );
}

function advanceLabel(phase: string): string {
  if (phase === "lobby") return "게임 시작";
  if (phase === "opening") return "Round 1 시작";
  if (phase.startsWith("round-")) {
    const n = parseInt(phase.split("-")[1]);
    return n >= 4 ? "투표 시작" : `Round ${n + 1} 시작`;
  }
  if (phase === "vote") return "결과 공개";
  return "";
}

// ── 세션 코드 표시 ─────────────────────────────────────────────
function SessionCode({ code }: { code: string }) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [serverIps, setServerIps] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/server-info")
      .then((r) => r.json())
      .then((d) => setServerIps(d.ips ?? []))
      .catch(() => {});
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

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
        {codeCopied ? "✓ 복사됨" : "코드 복사"}
      </button>

      {/* 서버 IP */}
      <div className="text-left space-y-1 pt-1 border-t border-dark-800">
        <p className="text-xs text-dark-600 text-center mb-1">접속 주소 (같은 Wi-Fi 필요)</p>
        {serverIps.length === 0 ? (
          <p className="text-xs text-dark-700 text-center font-mono">[IP 확인 중…]</p>
        ) : (
          serverIps.map((ip) => (
            <p key={ip} className="text-xs text-dark-400 font-mono text-center">
              {ip}:3000/join
            </p>
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
              ✓ {slot.playerName} 참가 중
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
  const icons: Record<string, string> = {
    phase_changed: "⚡",
    card_received: "🎴",
    card_transferred: "🔄",
    clue_revealed: "🔍",
    player_joined: "👤",
    system: "🔧",
  };
  return (
    <div className="h-48 overflow-y-auto space-y-1 p-3 bg-dark-950 rounded-lg border border-dark-800">
      {[...entries].reverse().map((e) => (
        <div key={e.id} className="flex gap-2 text-xs text-dark-400">
          <span className="shrink-0">{icons[e.type] ?? "•"}</span>
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
    if (!session) return;
    setAdvancing(true);
    await fetch(`/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance_phase" }),
    });
    setAdvancing(false);
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-mystery-500 mb-1">GM 대시보드</p>
          <h1 className="text-2xl font-bold text-dark-50">{game.title}</h1>
          <p className="text-sm text-dark-500 mt-1">
            {game.players.length}명 · {game.settings.difficulty} · {game.settings.estimatedDuration}분
          </p>
        </div>
        {session && (
          <div className="text-right">
            <p className="text-xs text-dark-500">현재 페이즈</p>
            <p className="text-lg font-bold text-mystery-300">{phaseLabel(phase)}</p>
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
          <p className="text-4xl mb-4">🎭</p>
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
                {["lobby", "opening", "round-1", "round-2", "round-3", "round-4", "vote", "ending"].map(
                  (p) => (
                    <span
                      key={p}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        phase === p
                          ? "border-mystery-600 bg-mystery-800/40 text-mystery-300"
                          : "border-dark-700 text-dark-600"
                      }`}
                    >
                      {phaseLabel(p)}
                    </span>
                  )
                )}
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
                  onClick={advancePhase}
                  disabled={advancing}
                  className="w-full py-2.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {advancing ? "처리 중…" : advanceLabel(phase)}
                </button>
              ) : (
                <div className="text-center py-2 text-sm text-dark-500">게임 종료</div>
              )}
            </div>

            {/* 페이즈 안내 */}
            <PhaseGuide phase={phase} game={game} />

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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-dark-300">
                플레이어 슬롯 (
                {session.sharedState.characterSlots.filter((s) => s.isLocked).length} /{" "}
                {session.sharedState.characterSlots.length} 참가)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {session.sharedState.characterSlots.map((slot) => {
                const character = game.players.find((p) => p.id === slot.playerId);
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
