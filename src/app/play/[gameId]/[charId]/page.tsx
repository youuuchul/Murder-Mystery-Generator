"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSSE } from "@/hooks/useSSE";
import type { GamePackage, Player, ClueCondition } from "@/types/game";
import type { SharedState, InventoryCard, VoteReveal } from "@/types/session";

const PHASE_LABEL: Record<string, string> = {
  lobby: "대기 중",
  opening: "오프닝",
  vote: "투표",
  ending: "엔딩",
};

const SUB_PHASE_LABEL: Record<string, string> = {
  investigation: "조사",
  discussion: "토론",
};

function phaseLabel(p: string, subPhase?: string) {
  if (p.startsWith("round-")) {
    const normalizedSubPhase = subPhase === "discussion" || subPhase === "briefing" ? "discussion" : "investigation";
    const sub = SUB_PHASE_LABEL[normalizedSubPhase] ?? "조사";
    return `Round ${p.split("-")[1]} ${sub}`;
  }
  return PHASE_LABEL[p] ?? p;
}

const VICTORY_COLOR: Record<string, string> = {
  "avoid-arrest":   "text-red-300 border-red-700 bg-red-950/20",
  uncertain:        "text-yellow-300 border-yellow-700 bg-yellow-950/20",
  "arrest-culprit": "text-blue-300 border-blue-700 bg-blue-950/20",
  "personal-goal":  "text-purple-300 border-purple-700 bg-purple-950/20",
};

const VICTORY_LABEL: Record<string, string> = {
  "avoid-arrest":   "검거 회피 (범인)",
  uncertain:        "검거 or 회피 (미확정)",
  "arrest-culprit": "범인 검거 (무고)",
  "personal-goal":  "개인 목표",
};

const TYPE_LABEL: Record<string, string> = {
  physical: "물적 증거", testimony: "증언", document: "문서", scene: "현장 단서",
};

type Tab = "character" | "timeline" | "inventory" | "locations" | "vote";

/**
 * 길이가 긴 개인 정보를 기본 접힘 상태로 보여줘
 * 모바일 플레이 화면이 과하게 길어지지 않도록 제어한다.
 */
function PrivateTextToggle({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-mystery-900 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-mystery-950/30 hover:bg-mystery-950/50 transition-colors text-left"
      >
        <span className="text-sm font-medium text-mystery-400">{title}</span>
        <span className="text-dark-500 text-xs ml-2 shrink-0">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-mystery-950/20">
          <p className="text-sm leading-relaxed text-dark-200 whitespace-pre-line">{content}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 카드/장소 이미지를 플레이어 화면 전반에서 같은 톤으로 렌더링한다.
 * 단서 목록 썸네일, 상세 카드, 장소 대표 이미지에 공통 사용한다.
 */
function ImageFrame({
  src,
  alt,
  compact = false,
}: {
  src: string;
  alt: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40 shrink-0",
        compact ? "w-16 h-16" : "w-full aspect-[4/3]",
      ].join(" ")}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

// ── 카드 상세 모달 ──────────────────────────────────────────────
function CardDetailModal({
  item,
  game,
  sessionId,
  token,
  myPlayerId,
  joinedSlots,
  onClose,
  onTransferred,
}: {
  item: InventoryCard;
  game: GamePackage;
  sessionId: string;
  token: string;
  myPlayerId: string;
  joinedSlots: { playerId: string; playerName: string | null }[];
  onClose: () => void;
  onTransferred: (cardId: string) => void;
}) {
  const clue = game.clues.find((c) => c.id === item.cardId);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);

  const candidates = joinedSlots.filter((s) => s.playerId !== myPlayerId);

  async function handleTransfer() {
    if (!transferTarget) return;
    if (!confirm(`${candidates.find((c) => c.playerId === transferTarget)?.playerName}에게 카드를 양도하시겠습니까?\n양도 후 이 카드는 당신 인벤토리에서 사라집니다.`)) return;
    setTransferring(true);
    const res = await fetch(`/api/sessions/${sessionId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "transfer", token, cardId: item.cardId, targetPlayerId: transferTarget }),
    });
    if (res.ok) {
      onTransferred(item.cardId);
      onClose();
    } else {
      const err = await res.json();
      alert(err.error ?? "양도 실패");
    }
    setTransferring(false);
  }

  const typeLabel: Record<string, string> = { physical: "물적 증거", testimony: "증언", document: "문서", scene: "현장 단서" };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 border-t border-dark-700 rounded-t-3xl p-6 space-y-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 카드 헤더 */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="font-bold text-dark-50 text-lg leading-tight">{clue?.title ?? "(제목 없음)"}</p>
            <p className="text-xs text-dark-500 mt-0.5">
              {typeLabel[clue?.type ?? ""] ?? clue?.type}
              {item.fromPlayerId && " · 이전받음"}
            </p>
          </div>
          <button onClick={onClose} className="text-dark-500 hover:text-dark-300 text-sm leading-none">닫기</button>
        </div>

        {/* 카드 내용 */}
        <div className="bg-dark-800 rounded-xl p-4 space-y-4">
          {clue?.imageUrl ? (
            <ImageFrame
              src={clue.imageUrl}
              alt={clue.title || "단서 카드 이미지"}
            />
          ) : null}
          <p className="text-dark-200 text-sm leading-relaxed">{clue?.description ?? "—"}</p>
        </div>

        {/* 양도 */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            {!showTransferForm ? (
              <button
                onClick={() => setShowTransferForm(true)}
                className="w-full py-3 border border-dark-600 rounded-xl text-dark-400 text-sm hover:border-dark-400 hover:text-dark-200 transition-colors"
              >
                이 카드 양도하기
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-dark-500">양도할 플레이어 선택</p>
                <select
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2.5 text-dark-200 text-sm focus:outline-none focus:ring-1 focus:ring-mystery-500"
                >
                  <option value="">— 선택 —</option>
                  {candidates.map((c) => (
                    <option key={c.playerId} value={c.playerId}>{c.playerName}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTransferForm(false)}
                    className="flex-1 py-2.5 border border-dark-700 rounded-lg text-dark-500 text-sm"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleTransfer}
                    disabled={!transferTarget || transferring}
                    className="flex-1 py-2.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                  >
                    {transferring ? "양도 중…" : "양도 확인"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 투표 결과 화면 ──────────────────────────────────────────────
function VoteResultScreen({
  reveal,
  game,
  myPlayerId,
}: {
  reveal: VoteReveal;
  game: GamePackage;
  myPlayerId: string;
}) {
  const culprit = game.players.find((p) => p.id === reveal.culpritPlayerId);
  const myVictoryCondition = game.players.find((p) => p.id === myPlayerId)?.victoryCondition;

  function myResult(): { label: string; color: string } {
    if (myPlayerId === reveal.culpritPlayerId) {
      // 나는 범인
      return reveal.majorityCorrect
        ? { label: "검거 당했습니다", color: "text-red-300" }
        : { label: "도주 성공!", color: "text-green-300" };
    }
    if (myVictoryCondition === "personal-goal") {
      return { label: "개인 목표 달성 여부를 확인하세요", color: "text-purple-300" };
    }
    // 무고한 플레이어
    return reveal.majorityCorrect
      ? { label: "수사 성공! 범인을 잡았습니다", color: "text-blue-300" }
      : { label: "범인이 도주했습니다", color: "text-red-300" };
  }

  const result = myResult();
  const totalVotes = reveal.tally.reduce((s, t) => s + t.count, 0);

  const commonNarration = game.scripts.ending?.narration;
  const branchNarration = reveal.majorityCorrect
    ? game.scripts.endingSuccess?.narration
    : game.scripts.endingFail?.narration;

  return (
    <div className="space-y-5">
      {/* 1. 엔딩 나레이션 (공통 + 분기) */}
      {(commonNarration || branchNarration) && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-dark-500 font-medium tracking-wide uppercase">엔딩</p>
          {commonNarration && (
            <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">{commonNarration}</p>
          )}
          {branchNarration && (
            <>
              {commonNarration && <hr className="border-dark-700" />}
              <p className="text-sm text-dark-100 leading-relaxed whitespace-pre-line">{branchNarration}</p>
            </>
          )}
        </div>
      )}

      {/* 2. 진범 공개 */}
      <div className="bg-dark-900 border border-mystery-800 rounded-xl p-4">
        <p className="text-xs text-mystery-500 mb-2">진범</p>
        <p className="text-xl font-bold text-mystery-300">
          {culprit?.name ?? "알 수 없음"}
        </p>
        {culprit?.background && (
          <p className="text-xs text-dark-500 mt-1">{culprit.background}</p>
        )}
      </div>

      {/* 3. 득표 현황 */}
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-dark-500">득표 현황 ({totalVotes}표)</p>
        {reveal.tally.map((t) => {
          const player = game.players.find((p) => p.id === t.playerId);
          const isCulprit = t.playerId === reveal.culpritPlayerId;
          const pct = totalVotes > 0 ? Math.round((t.count / totalVotes) * 100) : 0;
          return (
            <div key={t.playerId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-dark-200 flex items-center gap-1.5">
                  {isCulprit && <span className="text-xs text-mystery-400">진범</span>}
                  {player?.name ?? "(알 수 없음)"}
                </span>
                <span className="text-xs text-dark-400">{t.count}표 ({pct}%)</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isCulprit ? "bg-mystery-600" : "bg-dark-600"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {t.voterNames.length > 0 && (
                <p className="text-xs text-dark-600 mt-0.5">{t.voterNames.join(", ")}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. 승점 조건 */}
      {(game.players.find((p) => p.id === myPlayerId)?.scoreConditions?.length ?? 0) > 0 && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
          <p className="text-xs text-dark-500">내 승점 조건</p>
          {game.players
            .find((p) => p.id === myPlayerId)
            ?.scoreConditions.map((sc, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-dark-300">{sc.description}</span>
                <span className="text-mystery-400 font-bold">+{sc.points}점</span>
              </div>
            ))}
        </div>
      )}

      {/* 5. 결과 배너 (맨 아래) */}
      <div
        className={`rounded-2xl border p-6 text-center ${
          reveal.majorityCorrect
            ? "border-blue-700 bg-blue-950/20"
            : "border-red-700 bg-red-950/20"
        }`}
      >
        <p className="text-xl font-bold text-dark-50">
          {reveal.majorityCorrect ? "진범 검거 성공" : "진범 도주 성공"}
        </p>
        <p className={`text-sm mt-2 font-medium ${result.color}`}>{result.label}</p>
      </div>
    </div>
  );
}

// ── 투표 진행 화면 ──────────────────────────────────────────────
function VoteScreen({
  game,
  sharedState,
  myPlayerId,
  sessionId,
  token,
}: {
  game: GamePackage;
  sharedState: SharedState;
  myPlayerId: string;
  sessionId: string;
  token: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalPlayers = sharedState.characterSlots.filter((s) => s.isLocked).length;

  async function submitVote() {
    if (!selectedId) return;
    setSubmitting(true);
    const res = await fetch(`/api/sessions/${sessionId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, targetPlayerId: selectedId }),
    });
    if (res.ok) setSubmitted(true);
    else {
      const err = await res.json();
      alert(err.error ?? "투표 실패");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 border border-mystery-800 rounded-xl bg-mystery-950/10">
          <p className="text-mystery-300 font-semibold">투표 완료</p>
          <p className="text-dark-500 text-sm mt-1">
            {game.players.find((p) => p.id === selectedId)?.name}에게 투표했습니다
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-dark-500">
            {sharedState.voteCount} / {totalPlayers}명 투표 완료
          </p>
          <div className="mt-2 h-2 bg-dark-800 rounded-full overflow-hidden mx-auto max-w-xs">
            <div
              className="h-full bg-mystery-600 rounded-full transition-all duration-500"
              style={{ width: `${totalPlayers > 0 ? (sharedState.voteCount / totalPlayers) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-dark-600 mt-2">전원 투표 시 자동으로 결과가 공개됩니다.</p>
        </div>
      </div>
    );
  }

  // 자신 제외 투표 가능 (자기 자신에게는 투표 못 함)
  const votablePlayers = game.players.filter((p) => p.id !== myPlayerId);

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <p className="text-dark-200 font-semibold">범인이라 생각하는 사람은?</p>
        <p className="text-dark-500 text-xs mt-1">
          {sharedState.voteCount} / {totalPlayers}명 투표 완료
        </p>
      </div>

      <div className="space-y-2">
        {votablePlayers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className={[
              "w-full text-left px-4 py-3.5 rounded-xl border transition-all",
              selectedId === p.id
                ? "border-mystery-600 bg-mystery-950/30 ring-1 ring-mystery-600"
                : "border-dark-700 bg-dark-900 hover:border-dark-500",
            ].join(" ")}
          >
            <p className="font-semibold text-dark-100">{p.name}</p>
            {p.background && (
              <p className="text-xs text-dark-500 mt-0.5 line-clamp-1">{p.background}</p>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={submitVote}
        disabled={!selectedId || submitting}
        className="w-full py-3.5 bg-mystery-700 hover:bg-mystery-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-40"
      >
        {submitting ? "제출 중…" : "투표 제출"}
      </button>
    </div>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export default function PlayerView() {
  const { gameId, charId } = useParams() as { gameId: string; charId: string };
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s") ?? "";

  const [token, setToken] = useState("");
  const [game, setGame] = useState<GamePackage | null>(null);
  const [sharedState, setSharedState] = useState<SharedState | null>(null);
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [roundAcquired, setRoundAcquired] = useState<Record<string, number>>({});
  const [roundVisited, setRoundVisited] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("character");
  const [acquiring, setAcquiring] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<InventoryCard | null>(null);

  useEffect(() => {
    const t = localStorage.getItem(`mm_${sessionId}`) ?? "";
    if (!t) {
      setError("세션 정보가 없습니다. 참가 링크로 다시 접속해주세요.");
      setLoading(false);
    } else {
      setToken(t);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!token || !sessionId) return;
    async function fetchState() {
      const sessionRes = await fetch(`/api/sessions/${sessionId}?token=${token}`);
      if (!sessionRes.ok) {
        setError("세션에 접근할 수 없습니다.");
        setLoading(false);
        return;
      }
      const { sharedState: ss, playerState, game: g } = await sessionRes.json();
      setSharedState(ss);
      setInventory(playerState.inventory ?? []);
      setRoundAcquired(playerState.roundAcquired ?? {});
      setRoundVisited(playerState.roundVisitedLocations ?? {});
      setGame(g);
      setLoading(false);
    }
    fetchState();
  }, [token, sessionId, gameId]);

  // 투표 페이즈 진입 시 자동으로 투표 탭으로 전환
  useEffect(() => {
    if (sharedState?.phase === "vote") setTab("vote");
  }, [sharedState?.phase]);

  // 폴링 fallback — SSE가 프록시에 버퍼링될 때 3초마다 상태 동기화
  useEffect(() => {
    if (!token || !sessionId) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}?token=${token}`);
        if (!res.ok) return;
        const { sharedState: ss, playerState } = await res.json();
        setSharedState(ss);
        setInventory(playerState.inventory ?? []);
        setRoundAcquired(playerState.roundAcquired ?? {});
        setRoundVisited(playerState.roundVisitedLocations ?? {});
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [token, sessionId]);

  useSSE(
    sessionId && token ? `/api/sessions/${sessionId}/events` : null,
    {
      session_update: (data: unknown) => {
        const d = data as { sharedState: SharedState };
        setSharedState(d.sharedState);
      },
      [`inventory_${token}`]: (data: unknown) => {
        const d = data as { inventory: InventoryCard[]; roundAcquired?: Record<string, number>; roundVisitedLocations?: Record<string, string[]> };
        setInventory(d.inventory);
        if (d.roundAcquired) setRoundAcquired(d.roundAcquired);
        if (d.roundVisitedLocations) setRoundVisited(d.roundVisitedLocations);
      },
    }
  );

  /**
   * 클라이언트 사이드 조건 평가
   * - has_items: 내 인벤토리로 즉시 확인 가능
   * - character_has_item: 다른 플레이어 인벤토리 필요 → null (서버가 최종 판단)
   */
  function checkConditionLocally(condition: ClueCondition | undefined): boolean | null {
    if (!condition) return true;
    if (condition.type === "has_items") {
      return condition.requiredClueIds.every((id) => inventoryIds.has(id));
    }
    // character_has_item은 다른 플레이어 상태 필요 → 서버 전용
    return null;
  }

  async function acquireClue(locationId: string, clueId: string) {
    setAcquiring(clueId);
    const res = await fetch(`/api/sessions/${sessionId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acquire", clueId, locationId, token }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error ?? "획득 실패");
    }
    // 인벤토리 업데이트는 SSE inventory_${token} 이벤트에서만 처리
    // (로컬 update + SSE 동시 실행 시 이중 추가 버그 방지)
    setAcquiring(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400 animate-pulse">로딩 중…</p>
      </div>
    );
  }

  if (error || !game || !sharedState) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-dark-400">{error || "데이터 로드 실패"}</p>
        </div>
      </div>
    );
  }

  const character: Player | undefined = game.players.find((p) => p.id === charId);
  if (!character) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <p className="text-dark-400">캐릭터를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const phase = sharedState.phase;
  const isRound = phase.startsWith("round-");
  const currentRound = sharedState.currentRound;

  const accessibleLocations = (game.locations ?? []).filter((loc) => {
    if (loc.ownerPlayerId === charId) return false;
    if (loc.unlocksAtRound !== null && currentRound < (loc.unlocksAtRound ?? 0)) return false;
    return true;
  });
  const ownedLocations = (game.locations ?? [])
    .filter((l) => l.ownerPlayerId === charId)
    .map((l) => l.name);
  const inventoryIds = new Set(inventory.map((i) => i.cardId));

  const joinedSlots = sharedState.characterSlots.filter((s) => s.isLocked);

  // 결과 공개 상태면 전체 결과 화면 표시
  if (phase === "ending" && sharedState.voteReveal) {
    return (
      <div className="min-h-screen bg-dark-950 text-dark-100">
        <div className="sticky top-0 z-10 bg-dark-950/95 backdrop-blur border-b border-dark-800 px-4 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-dark-500 truncate max-w-[140px]">{game.title}</p>
            <p className="text-sm font-semibold text-dark-100">{character.name}</p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full border border-yellow-700 bg-yellow-950/20 text-yellow-300">
            결과 공개
          </span>
        </div>
        <div className="p-4 max-w-lg mx-auto pb-8">
          <VoteResultScreen
            reveal={sharedState.voteReveal}
            game={game}
            myPlayerId={charId}
          />
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "character", label: "캐릭터 카드" },
    { id: "timeline", label: "타임라인", hidden: !game.story.timeline.enabled || game.story.timeline.slots.length === 0 },
    { id: "inventory", label: `인벤토리 (${inventory.length})` },
    { id: "locations", label: "장소 탐색" },
    { id: "vote", label: "투표", hidden: phase !== "vote" },
  ];

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      {/* 상단 상태 바 */}
      <div className="sticky top-0 z-10 bg-dark-950/95 backdrop-blur border-b border-dark-800 px-4 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-xs text-dark-500 truncate max-w-[140px]">{game.title}</p>
          <p className="text-sm font-semibold text-dark-100">{character.name}</p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full border font-medium ${
            phase === "vote"
              ? "border-yellow-700 bg-yellow-950/20 text-yellow-300 animate-pulse"
              : isRound
              ? "border-mystery-700 bg-mystery-950/20 text-mystery-300"
              : "border-dark-700 text-dark-500"
          }`}
        >
          {phaseLabel(phase, sharedState?.currentSubPhase)}
        </span>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4 pb-8">
        {/* 오프닝 페이즈 — 사건 개요 배너 */}
        {phase === "opening" && (
          <div className="space-y-3">
            <div className="bg-mystery-950/40 border border-mystery-800 rounded-2xl p-5 space-y-4">
              <div className="text-center">
                <p className="text-xs text-mystery-500 mb-1">오프닝</p>
                <p className="text-xl font-bold text-dark-50">{game.title}</p>
              </div>
              {game.scripts.opening.narration && (
                <div className="border-t border-mystery-900 pt-4">
                  <p className="text-xs text-mystery-500 mb-2">나레이션</p>
                  <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
                    {game.scripts.opening.narration}
                  </p>
                </div>
              )}
              {game.story.incident && (
                <div className="border-t border-mystery-900 pt-4">
                  <p className="text-xs text-mystery-500 mb-2">사건 개요</p>
                  <p className="text-sm text-dark-200 leading-relaxed">{game.story.incident}</p>
                </div>
              )}
              {game.story.victim?.name && (
                <div className="bg-dark-900/60 rounded-xl p-3 space-y-1">
                  <p className="text-xs text-red-500">피해자</p>
                  <p className="text-sm font-semibold text-dark-100">{game.story.victim.name}</p>
                  {game.story.victim.background && (
                    <p className="text-xs text-dark-500">{game.story.victim.background}</p>
                  )}
                  {game.story.victim.deathCircumstances && (
                    <p className="text-xs text-dark-400 mt-1">{game.story.victim.deathCircumstances}</p>
                  )}
                </div>
              )}
            </div>
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
              <p className="text-xs text-dark-500 mb-1">내 캐릭터</p>
              <p className="font-bold text-dark-50">{character.name}</p>
              <p className="text-sm text-dark-300 leading-relaxed">{character.background || "—"}</p>
            </div>
          </div>
        )}

        {/* 투표 알림 배너 */}
        {phase === "vote" && tab !== "vote" && (
          <button
            onClick={() => setTab("vote")}
            className="w-full py-3 bg-yellow-950/20 border border-yellow-700 rounded-xl text-yellow-300 text-sm font-medium animate-pulse"
          >
            투표 페이즈 - 탭하여 투표하기
          </button>
        )}

        {/* 탭 */}
        <div className="flex gap-1 bg-dark-900 p-1 rounded-xl border border-dark-800">
          {tabs
            .filter((t) => !t.hidden)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap overflow-hidden text-ellipsis",
                  tab === t.id
                    ? "bg-dark-700 text-dark-50"
                    : t.id === "vote"
                    ? "text-yellow-500 hover:text-yellow-300"
                    : "text-dark-500 hover:text-dark-300",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
        </div>

        {/* ── 캐릭터 카드 ── */}
        {tab === "character" && (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${VICTORY_COLOR[character.victoryCondition] ?? "border-dark-700 bg-dark-900"}`}>
              <p className="text-xs opacity-70 mb-1">승리 조건</p>
              <p className="font-bold text-base">{VICTORY_LABEL[character.victoryCondition] ?? character.victoryCondition}</p>
              {character.victoryCondition === "personal-goal" && character.personalGoal && (
                <p className="text-sm mt-2 opacity-80">{character.personalGoal}</p>
              )}
            </div>
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
              <p className="text-xs text-dark-500 mb-2">배경 (전원 공개)</p>
              <p className="text-sm leading-relaxed text-dark-200">{character.background || "—"}</p>
            </div>
            {character.relatedClues.length > 0 && (
              <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
                <p className="text-xs text-dark-500">나와 관련된 단서 (위치 정보)</p>
                {character.relatedClues.map((rc, i) => {
                  const clue = game.clues.find((c) => c.id === rc.clueId);
                  return (
                    <div key={i} className="border-l-2 border-dark-700 pl-3">
                      <p className="text-sm text-dark-300 font-medium">{clue?.title ?? "(알 수 없는 단서)"}</p>
                      {rc.note && <p className="text-xs text-dark-500 mt-0.5">{rc.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {character.relationships.length > 0 && (
              <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-dark-500">관계</p>
                {character.relationships.map((rel, i) => {
                  const other = game.players.find((p) => p.id === rel.playerId);
                  return (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-dark-400 font-medium shrink-0">{other?.name ?? "(알 수 없음)"}</span>
                      <span className="text-dark-500">{rel.description}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {character.scoreConditions.length > 0 && (
              <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-dark-500">승점 조건</p>
                {character.scoreConditions.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-dark-300">{sc.description}</span>
                    <span className="text-mystery-400 font-bold shrink-0">+{sc.points}점</span>
                  </div>
                ))}
              </div>
            )}
            {character.story ? (
              <PrivateTextToggle
                title="상세 스토리 (본인만 열람)"
                content={character.story}
              />
            ) : null}
            {character.secret ? (
              <PrivateTextToggle
                title="비밀 / 반전 정보 (본인만 열람)"
                content={character.secret}
              />
            ) : null}
          </div>
        )}

        {/* ── 인벤토리 ── */}
        {tab === "inventory" && (
          <div className="space-y-3">
            {inventory.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-dark-800 rounded-xl">
                <p className="text-dark-600 text-sm">보유한 단서 카드가 없습니다.</p>
                {isRound && <p className="text-dark-700 text-xs mt-1">장소 탐색 탭에서 단서를 획득하세요.</p>}
              </div>
            ) : (
              inventory.map((item) => {
                const clue = game.clues.find((c) => c.id === item.cardId);
                if (!clue) return null;
                return (
                  <button
                    key={item.cardId}
                    onClick={() => setSelectedCard(item)}
                    className="w-full text-left bg-dark-900 border border-dark-700 rounded-xl p-4 hover:border-dark-500 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {clue.imageUrl ? (
                        <ImageFrame
                          src={clue.imageUrl}
                          alt={clue.title || "단서 카드 이미지"}
                          compact
                        />
                      ) : (
                        <div className="w-16 h-16 shrink-0 rounded-xl border border-dark-800 bg-dark-950/60 flex items-center justify-center">
                          <span className="text-[11px] text-dark-600 text-center leading-tight px-2">
                            이미지 없음
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-dark-100 truncate">{clue.title}</p>
                        <p className="text-xs text-dark-500 mt-0.5">
                          {TYPE_LABEL[clue.type] ?? clue.type}{item.fromPlayerId && " · 이전받음"}
                        </p>
                      </div>
                      <span className="text-dark-600 text-xs shrink-0">자세히 →</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── 타임라인 ── */}
        {tab === "timeline" && game.story.timeline.enabled && game.story.timeline.slots.length > 0 && (
          <div className="space-y-3">
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-dark-500">행동 타임라인 (본인만 열람)</p>
                <span className="text-[11px] text-dark-600">
                  {character.timelineEntries.filter((entry) => entry.action.trim().length > 0).length}
                  / {game.story.timeline.slots.length}
                </span>
              </div>
            </div>
            {(() => {
              const filledTimeline = game.story.timeline.slots
                .map((slot) => ({
                  slot,
                  entry: character.timelineEntries.find((item) => item.slotId === slot.id),
                }))
                .filter(({ entry }) => Boolean(entry?.action.trim()));

              if (filledTimeline.length === 0) {
                return (
                  <div className="bg-dark-900 border border-dashed border-dark-800 rounded-xl p-6 text-center">
                    <p className="text-sm text-dark-500">표시할 행동 타임라인이 없습니다.</p>
                  </div>
                );
              }

              return filledTimeline.map(({ slot, entry }) => (
                <div key={slot.id} className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-medium text-mystery-400">{slot.label || "이름 없는 슬롯"}</p>
                  <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
                    {entry?.action}
                  </p>
                </div>
              ));
            })()}
          </div>
        )}

        {/* ── 장소 탐색 ── */}
        {tab === "locations" && (
          <div className="space-y-3">
            {!isRound ? (
              <div className="text-center py-12 text-dark-600 text-sm">
                조사 페이즈에서 장소를 탐색할 수 있습니다.
              </div>
            ) : (
              <>
                {/* 획득 현황 */}
                {(() => {
                  const limit = game.rules?.cluesPerRound ?? 0;
                  const acquired = roundAcquired[String(currentRound)] ?? 0;
                  if (limit === 0) return null;
                  const full = acquired >= limit;
                  return (
                    <div className={`border rounded-xl p-3 flex items-center justify-between ${
                      full ? "border-red-800/60 bg-red-950/20" : "border-dark-700 bg-dark-900/60"
                    }`}>
                      <p className={`text-xs ${full ? "text-red-400" : "text-dark-400"}`}>
                        {full
                          ? `이번 라운드 획득 한도(${limit}개) 도달 - 다음 라운드에 초기화됩니다`
                          : `이번 라운드 단서 획득`}
                      </p>
                      <span className={`text-sm font-bold shrink-0 ml-2 ${full ? "text-red-300" : "text-mystery-300"}`}>
                        {acquired} / {limit}
                      </span>
                    </div>
                  );
                })()}

                {ownedLocations.length > 0 && (
                  <div className="bg-orange-950/20 border border-orange-900/50 rounded-xl p-3">
                    <p className="text-xs text-orange-400">
                      자신의 공간({ownedLocations.join(", ")})에는 접근할 수 없습니다.
                    </p>
                  </div>
                )}
                {accessibleLocations.length === 0 ? (
                  <div className="text-center py-8 text-dark-600 text-sm">
                    이 라운드에서 접근 가능한 장소가 없습니다.
                  </div>
                ) : (
                  accessibleLocations.map((loc) => {
                    const locClues = game.clues.filter((c) => c.locationId === loc.id && !c.isSecret);
                    const visitedThisRound = (roundVisited[String(currentRound)] ?? []).includes(loc.id);
                    const globalAcquired = sharedState.acquiredClueIds ?? [];
                    const allowRevisit = game.rules?.allowLocationRevisit ?? true;
                    const limitReached = (() => {
                      const limit = game.rules?.cluesPerRound ?? 0;
                      if (limit === 0) return false;
                      return (roundAcquired[String(currentRound)] ?? 0) >= limit;
                    })();

                    // 장소 입장 조건 클라이언트 체크
                    const locationCondMet = checkConditionLocally(loc.accessCondition);
                    // has_items 조건이 명확히 미충족인 경우만 잠금 표시
                    const locationLocked = locationCondMet === false;

                    return (
                      <div key={loc.id} className={`bg-dark-900 border rounded-xl overflow-hidden ${
                        locationLocked
                          ? "border-red-900/50 opacity-70"
                          : !allowRevisit && visitedThisRound
                          ? "border-dark-700 opacity-60"
                          : "border-dark-800"
                      }`}>
                        <div className="px-4 py-3 bg-dark-800/60 flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${locationLocked ? "text-dark-400" : "text-dark-100"}`}>
                            {loc.name}
                          </span>
                          {loc.accessCondition && (
                            <span className={`text-xs border px-1.5 py-0.5 rounded-full ${
                              locationLocked
                                ? "text-red-400 border-red-800 bg-red-950/30"
                                : locationCondMet === true
                                ? "text-green-400 border-green-800 bg-green-950/20"
                                : "text-yellow-400 border-yellow-800 bg-yellow-950/20"
                            }`}>
                              {locationLocked ? "입장 불가" : locationCondMet === true ? "조건 충족" : "조건 확인 중"}
                            </span>
                          )}
                          {!allowRevisit && visitedThisRound && !locationLocked && (
                            <span className="text-xs text-dark-500 border border-dark-700 px-1.5 py-0.5 rounded-full">
                              이번 라운드 방문 완료
                            </span>
                          )}
                          <span className="text-xs text-dark-600 ml-auto">단서 {locClues.length}개</span>
                        </div>
                        {/* 장소 조건 힌트 */}
                        {loc.accessCondition?.hint && (
                          <div className={`px-4 py-2 text-xs ${
                            locationLocked ? "text-red-400 bg-red-950/10" : "text-yellow-400/80 bg-yellow-950/10"
                          }`}>
                            {loc.accessCondition.hint}
                          </div>
                        )}
                        {loc.imageUrl && (
                          <div className="px-4 pt-4">
                            <ImageFrame
                              src={loc.imageUrl}
                              alt={loc.name || "장소 이미지"}
                            />
                          </div>
                        )}
                        {loc.description && (
                          <p className="px-4 pt-3 text-xs text-dark-500">{loc.description}</p>
                        )}
                        <div className="p-3 space-y-2">
                          {locClues.length === 0 ? (
                            <p className="text-xs text-dark-700 text-center py-2">단서 없음</p>
                          ) : (
                            locClues.map((clue, idx) => {
                              const alreadyHas = inventoryIds.has(clue.id);
                              const takenByOther = !alreadyHas && globalAcquired.includes(clue.id);

                              // 단서 획득 조건 체크
                              const clueCondMet = checkConditionLocally(clue.condition);
                              const clueLocked = clueCondMet === false; // has_items 조건이 명확히 미충족

                              return (
                                <div
                                  key={clue.id}
                                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                                    alreadyHas
                                      ? "border-mystery-800 bg-mystery-950/20 opacity-70"
                                      : takenByOther
                                      ? "border-dark-800 bg-dark-800/20 opacity-50"
                                      : clueLocked || locationLocked
                                      ? "border-red-900/40 bg-dark-900/40"
                                      : clue.condition
                                      ? "border-yellow-900/50 bg-dark-800/40"
                                      : "border-dark-700 bg-dark-800/40"
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    {alreadyHas ? (
                                      <p className="text-sm text-mystery-300 font-medium truncate">
                                        {clue.title || "(카드)"}
                                      </p>
                                    ) : takenByOther ? (
                                      <>
                                        <p className="text-sm text-dark-600">카드 #{idx + 1}</p>
                                        <p className="text-xs text-dark-700">다른 플레이어가 보유 중</p>
                                      </>
                                    ) : clue.condition ? (
                                      <>
                                        <p className="text-sm text-dark-400 font-medium">
                                          조건부 단서 #{idx + 1}
                                        </p>
                                        {clue.condition.hint && (
                                          <p className="text-xs text-yellow-500/80 mt-0.5">{clue.condition.hint}</p>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm text-dark-500">? 카드 #{idx + 1}</p>
                                        <p className="text-xs text-dark-700">획득 후 내용 확인 가능</p>
                                      </>
                                    )}
                                  </div>
                                  {alreadyHas ? (
                                    <span className="text-xs text-mystery-500 shrink-0">보유 중</span>
                                  ) : takenByOther ? (
                                    <span className="text-xs text-dark-600 shrink-0">보유됨</span>
                                  ) : locationLocked ? (
                                    <span className="text-xs text-red-500 shrink-0">장소 잠금</span>
                                  ) : limitReached ? (
                                    <span className="text-xs text-red-400 shrink-0">한도 초과</span>
                                  ) : !allowRevisit && visitedThisRound ? (
                                    <span className="text-xs text-dark-500 shrink-0">방문 완료</span>
                                  ) : clueLocked ? (
                                    <span className="text-xs text-red-400 shrink-0">조건 미충족</span>
                                  ) : (
                                    <button
                                      onClick={() => acquireClue(loc.id, clue.id)}
                                      disabled={acquiring === clue.id}
                                      className="text-xs px-3 py-1.5 rounded-lg bg-mystery-800 hover:bg-mystery-700 text-mystery-200 border border-mystery-700 shrink-0 transition-colors disabled:opacity-50"
                                    >
                                      {acquiring === clue.id ? "…" : "획득"}
                                    </button>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}

        {/* ── 투표 ── */}
        {tab === "vote" && phase === "vote" && (
          <VoteScreen
            game={game}
            sharedState={sharedState}
            myPlayerId={charId}
            sessionId={sessionId}
            token={token}
          />
        )}
      </div>

      {/* 카드 상세 모달 */}
      {selectedCard && (
        <CardDetailModal
          item={selectedCard}
          game={game}
          sessionId={sessionId}
          token={token}
          myPlayerId={charId}
          joinedSlots={joinedSlots}
          onClose={() => setSelectedCard(null)}
          onTransferred={(cardId) => {
            setInventory((prev) => prev.filter((i) => i.cardId !== cardId));
            setSelectedCard(null);
          }}
        />
      )}
    </div>
  );
}
