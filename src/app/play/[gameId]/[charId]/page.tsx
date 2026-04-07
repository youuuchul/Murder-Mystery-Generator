"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useSSE } from "@/hooks/useSSE";
import {
  ENDING_STAGE_LABELS,
  normalizeEndingStage,
  resolveActiveEndingBranch,
  resolveBranchPersonalEndings,
} from "@/lib/ending-flow";
import {
  getAdvanceConfirmKind,
  getPlayerAdvanceRequestLabel,
  type SessionAdvanceConfirmKind,
} from "@/lib/session-phase";
import type { Clue, GamePackage, Player, ClueCondition } from "@/types/game";
import type { EndingStage, SharedState, InventoryCard, VoteReveal } from "@/types/session";

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
  physical: "물적 증거", testimony: "증언", scene: "현장 단서",
};

type Tab = "character" | "inventory" | "locations" | "vote";
type CharacterPanel = "profile" | "people" | "timeline";
const CHARACTER_PANEL_LABELS: Record<CharacterPanel, string> = {
  profile: "내 정보",
  people: "인물 정보",
  timeline: "타임라인",
};

/**
 * 모바일 화면에서 긴 개인 정보를 접고 펼칠 수 있는 공통 섹션.
 * 설명문, 점수 조건, 단서 목록처럼 성격이 다른 콘텐츠도 같은 UI로 다룬다.
 */
function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
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
        <div className="px-4 py-4 bg-mystery-950/20 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * 길이가 긴 개인 정보를 기본 접힘 상태로 보여줘.
 * 모바일 플레이 화면이 과하게 길어지지 않도록 제어한다.
 */
function PrivateTextToggle({ title, content }: { title: string; content: string }) {
  if (!content.trim()) return null;

  return (
    <CollapsibleSection title={title}>
      <p className="text-sm leading-relaxed text-dark-200 whitespace-pre-line">{content}</p>
    </CollapsibleSection>
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
  variant = "default",
}: {
  src: string;
  alt: string;
  compact?: boolean;
  variant?: "default" | "portrait" | "document";
}) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40 shrink-0",
        compact
          ? "w-16 h-16"
          : variant === "portrait"
            ? "w-full aspect-[3/4]"
            : variant === "document"
              ? "w-full aspect-[4/5]"
              : "w-full aspect-[4/3]",
      ].join(" ")}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={
          compact
            ? "64px"
            : variant === "portrait"
              ? "(max-width: 768px) 100vw, 420px"
              : variant === "document"
                ? "(max-width: 768px) 100vw, 560px"
                : "(max-width: 768px) 100vw, 640px"
        }
        className={[
          "w-full h-full",
          variant === "document" ? "object-contain" : "object-cover object-center",
        ].join(" ")}
      />
    </div>
  );
}

/**
 * 현재 플레이어가 특정 인물에 대해 입력한 관계/인상만 추려낸다.
 * 다른 캐릭터의 관계는 플레이어 화면에 노출하지 않는다.
 */
function collectViewerImpressions(
  viewer: Player,
  targetType: "player" | "victim" | "npc",
  targetId: string
): string[] {
  return viewer.relationships
    .filter((relationship) => (
      relationship.targetType === targetType
      && (relationship.targetId || relationship.playerId) === targetId
      && Boolean(relationship.description.trim())
    ))
    .map((relationship) => relationship.description);
}

function PersonInfoPanel({
  game,
  currentPlayer,
}: {
  game: GamePackage;
  currentPlayer: Player;
}) {
  const people = [
    ...game.players
      .filter((player) => player.id !== currentPlayer.id)
      .map((player) => ({
        id: player.id,
        type: "player" as const,
        roleLabel: "캐릭터",
        name: player.name,
        background: player.background,
        imageUrl: player.cardImage,
        impressions: collectViewerImpressions(currentPlayer, "player", player.id),
      })),
    {
      id: "victim",
      type: "victim" as const,
      roleLabel: "피해자",
      name: game.story.victim.name,
      background: game.story.victim.background,
      imageUrl: game.story.victim.imageUrl,
      impressions: collectViewerImpressions(currentPlayer, "victim", "victim"),
    },
    ...game.story.npcs.map((npc) => ({
      id: npc.id,
      type: "npc" as const,
      roleLabel: "NPC",
      name: npc.name,
      background: npc.background,
      imageUrl: npc.imageUrl,
      impressions: collectViewerImpressions(currentPlayer, "npc", npc.id),
    })),
  ].filter((person) => person.name || person.background || person.imageUrl || person.impressions.length > 0);

  if (people.length === 0) {
    return (
      <div className="bg-dark-900 border border-dashed border-dark-800 rounded-xl p-6 text-center">
        <p className="text-sm text-dark-500">확인할 인물 정보가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {people.map((person) => (
        <div key={`${person.type}:${person.id}`} className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-4">
          <div className="flex items-start gap-3">
            {person.imageUrl ? (
              <div className="w-20">
                <ImageFrame src={person.imageUrl} alt={person.name || person.roleLabel} compact={false} variant="portrait" />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-mystery-500">{person.roleLabel}</p>
              <p className="font-semibold text-dark-100 mt-1">{person.name || "(이름 없음)"}</p>
              {person.background ? (
                <p className="text-sm text-dark-300 leading-relaxed mt-2">{person.background}</p>
              ) : (
                <p className="text-sm text-dark-600 mt-2">입력된 배경이 없습니다.</p>
              )}
            </div>
          </div>

          <div className="border-t border-dark-800 pt-3 space-y-2">
            <p className="text-xs text-dark-500">내가 보는 인상</p>
            {person.impressions.length === 0 ? (
              <p className="text-sm text-dark-600">입력된 관계 / 인상이 없습니다.</p>
            ) : (
              person.impressions.map((impression, index) => (
                <p key={`${person.type}:${person.id}:${index}`} className="text-sm text-dark-300 leading-relaxed">
                  {impression}
                </p>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelinePanel({
  game,
  character,
}: {
  game: GamePackage;
  character: Player;
}) {
  if (!game.story.timeline.enabled || game.story.timeline.slots.length === 0) {
    return (
      <div className="bg-dark-900 border border-dashed border-dark-800 rounded-xl p-6 text-center">
        <p className="text-sm text-dark-500">타임라인이 설정되지 않았습니다.</p>
      </div>
    );
  }

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

  return (
    <div className="space-y-3">
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
        <p className="text-xs text-dark-500">행동 타임라인 (본인만 열람)</p>
      </div>
      {filledTimeline.map(({ slot, entry }) => (
        <div key={slot.id} className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-mystery-400">{slot.label || "이름 없는 슬롯"}</p>
          <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
            {entry?.action}
          </p>
        </div>
      ))}
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

  const typeLabel: Record<string, string> = { physical: "물적 증거", testimony: "증언", scene: "현장 단서" };

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
              variant="document"
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

/** 현장 단서를 인벤토리와 분리해 읽기 전용 모달로 보여준다. */
function SceneClueModal({
  clue,
  onClose,
}: {
  clue: Clue;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 border-t border-dark-700 rounded-t-3xl p-6 space-y-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="font-bold text-dark-50 text-lg leading-tight">{clue.title || "(제목 없음)"}</p>
            <p className="text-xs text-dark-500 mt-0.5">현장 단서</p>
          </div>
          <button onClick={onClose} className="text-dark-500 hover:text-dark-300 text-sm leading-none">닫기</button>
        </div>

        <div className="bg-dark-800 rounded-xl p-4 space-y-4">
          {clue.imageUrl ? (
            <ImageFrame
              src={clue.imageUrl}
              alt={clue.title || "현장 단서 이미지"}
              variant="document"
            />
          ) : null}
          <p className="text-dark-200 text-sm leading-relaxed whitespace-pre-line">{clue.description || "—"}</p>
        </div>
      </div>
    </div>
  );
}

// ── 투표 결과 화면 ──────────────────────────────────────────────
function VoteResultScreen({
  reveal,
  game,
  myPlayerId,
  endingStage,
}: {
  reveal: VoteReveal;
  game: GamePackage;
  myPlayerId: string;
  endingStage: EndingStage;
}) {
  const culprit = game.players.find((p) => p.id === reveal.culpritPlayerId);
  const arrested = game.players.find((p) => p.id === reveal.arrestedPlayerId);
  const branch = resolveActiveEndingBranch(game, reveal);
  const branchPersonalEndings = resolveBranchPersonalEndings(branch);
  const personalEnding = branchPersonalEndings.find((ending) => ending.playerId === myPlayerId)
    ?? branchPersonalEndings[0];
  const showPersonalEnding = endingStage !== "branch" && Boolean(personalEnding?.text.trim());
  const hasPersonalEndingForPlayer = Boolean(branch?.personalEndingsEnabled) && branchPersonalEndings.length > 0;
  const totalVotes = reveal.tally.reduce((s, t) => s + t.count, 0);

  return (
    <div className="space-y-5">
      {/* 1. 분기 엔딩 */}
      {branch?.storyText && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 space-y-4">
          <p className="text-xs text-dark-500 font-medium tracking-wide uppercase">엔딩</p>
          {branch.label && <p className="text-sm font-medium text-mystery-300">{branch.label}</p>}
          <p className="text-sm text-dark-100 leading-relaxed whitespace-pre-line">{branch.storyText}</p>
        </div>
      )}

      {/* 2. 진범 공개 */}
      <div className="bg-dark-900 border border-mystery-800 rounded-xl p-4">
        <p className="text-xs text-mystery-500 mb-2">진범</p>
        <p className="text-xl font-bold text-mystery-300">
          {culprit?.name ?? "알 수 없음"}
        </p>
      </div>

      {arrested && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
          <p className="text-xs text-dark-500 mb-2">검거된 인물</p>
          <p className="text-lg font-semibold text-dark-100">{arrested.name}</p>
        </div>
      )}

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

      {showPersonalEnding && personalEnding && (
        <div className="bg-dark-900 border border-mystery-800 rounded-xl p-5 space-y-3">
          <p className="text-xs text-mystery-500">개인 엔딩</p>
          {personalEnding.title && (
            <p className="text-sm font-semibold text-mystery-300">{personalEnding.title}</p>
          )}
          <p className="text-sm text-dark-100 leading-relaxed whitespace-pre-line">{personalEnding.text}</p>
        </div>
      )}

      {endingStage === "branch" && hasPersonalEndingForPlayer && (
        <div className="rounded-xl border border-dark-800 bg-dark-900 p-4 text-center">
          <p className="text-xs text-dark-500">GM이 다음 단계를 공개하면 개인 엔딩이 열립니다.</p>
        </div>
      )}
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

  // 현재는 자기 자신을 포함해 모든 참가 캐릭터에게 투표할 수 있다.
  const votablePlayers = game.players;

  return (
    <div className="space-y-4">
      {game.scripts.vote.narration && (
        <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
          <p className="text-xs text-yellow-500 mb-2">투표 안내</p>
          <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
            {game.scripts.vote.narration}
          </p>
        </div>
      )}

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
              "w-full rounded-xl border px-4 py-3.5 text-left transition-all",
              selectedId === p.id
                ? "border-mystery-600 bg-mystery-950/30 ring-1 ring-mystery-600"
                : "border-dark-700 bg-dark-900 hover:border-dark-500",
            ].join(" ")}
          >
            <div className="flex items-center gap-3">
              {p.cardImage ? (
                <div className="w-14 shrink-0">
                  <ImageFrame src={p.cardImage} alt={p.name} compact={false} variant="portrait" />
                </div>
              ) : null}
              <p className="font-semibold text-dark-100">{p.name}</p>
            </div>
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

/**
 * 플레이어가 다음 단계 진행 요청 상태를 확인하고 토글하는 패널이다.
 * 서버가 실제 진행 여부를 판정하고, 클라이언트는 요청/취소와 합의 현황만 표시한다.
 */
function PhaseAdvanceRequestPanel({
  label,
  requestedCount,
  totalCount,
  requested,
  submitting,
  onToggle,
}: {
  label: string;
  requestedCount: number;
  totalCount: number;
  requested: boolean;
  submitting: boolean;
  onToggle: () => void;
}) {
  const progress = totalCount > 0 ? (requestedCount / totalCount) * 100 : 0;

  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-dark-500">다음 단계 진행</p>
          <p className="mt-1 text-sm font-semibold text-dark-100">{label}</p>
        </div>
        <span className="rounded-full border border-dark-700 px-2 py-1 text-xs text-dark-300">
          {requestedCount} / {totalCount}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-dark-800">
        <div
          className="h-full rounded-full bg-mystery-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-xs leading-5 text-dark-500">
        모두 요청하면 자동으로 다음 단계로 넘어갑니다.
        {requested ? " 내 요청은 이미 반영되어 있습니다." : ""}
      </p>

      <button
        type="button"
        onClick={onToggle}
        disabled={submitting}
        className={[
          "w-full rounded-xl px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50",
          requested
            ? "border border-dark-700 text-dark-200 hover:border-dark-500 hover:text-dark-50"
            : "border border-mystery-700 bg-mystery-900/30 text-mystery-100 hover:bg-mystery-800/40",
        ].join(" ")}
      >
        {submitting ? "처리 중…" : requested ? "요청 취소" : label}
      </button>
    </div>
  );
}

/**
 * 플레이어가 합의 기반 진행을 누르기 전, 실수하기 쉬운 전환만 한 번 더 확인한다.
 * 대기실 시작은 인원 확인을, 최종 투표 진입은 마지막 단계 경고를 보여준다.
 */
function PlayerAdvanceConfirmModal({
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
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const isOpening = kind === "opening";
  const isFull = joinedPlayerCount >= totalPlayerCount;

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
              ? "지금 입장한 인원을 확인한 뒤 오프닝으로 넘어갑니다."
              : "투표가 시작되면 전원 투표 후 바로 엔딩 공개로 이어집니다."}
          </p>
        </div>

        {isOpening ? (
          <div className="mt-5 rounded-xl border border-dark-800 bg-dark-950/60 p-4">
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
        ) : (
          <div className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/10 p-4">
            <p className="text-sm leading-6 text-amber-200">
              준비가 되었다면 투표를 시작하세요. 투표가 시작되면 되돌릴 수 없습니다.
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
            onClick={onConfirm}
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

/**
 * 플레이어가 현재 방의 참가 코드와 링크를 다시 확인할 수 있는 패널이다.
 * 대기실에서는 기본 펼침, 게임 진행 중에는 접힌 상태에서 필요할 때만 펼친다.
 */
function PlayerJoinAccessPanel({
  sessionName,
  sessionCode,
  isLobby,
}: {
  sessionName: string;
  sessionCode: string;
  isLobby: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(isLobby);
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [publicOrigin, setPublicOrigin] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);

  useEffect(() => {
    setIsExpanded(isLobby);
  }, [isLobby]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { origin, hostname } = window.location;
    setPublicOrigin(isLocalOnlyHost(hostname) ? null : origin);
  }, []);

  useEffect(() => {
    if (!isLobby || publicOrigin || tunnelUrl) return;

    let cancelled = false;
    async function fetchServerInfo() {
      try {
        const response = await fetch("/api/server-info");
        if (!response.ok) return;
        const data = await response.json() as { tunnelUrl?: string | null };
        if (!cancelled) {
          setTunnelUrl(data.tunnelUrl ?? null);
        }
      } catch {}
    }

    void fetchServerInfo();
    const intervalId = setInterval(() => {
      void fetchServerInfo();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isLobby, publicOrigin, tunnelUrl]);

  function copyCode() {
    void navigator.clipboard.writeText(sessionCode);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 2000);
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url);
    setUrlCopied(true);
    window.setTimeout(() => setUrlCopied(false), 2000);
  }

  const joinUrl = publicOrigin
    ? `${publicOrigin}/join/${sessionCode}`
    : tunnelUrl
      ? `${tunnelUrl}/join/${sessionCode}`
      : null;

  if (!isLobby && !isExpanded) {
    return (
      <div className="rounded-2xl border border-dark-800 bg-dark-900 p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-dark-500">현재 방</p>
          <p className="mt-1 text-sm font-semibold text-dark-100">{sessionName}</p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="rounded-xl border border-dark-700 px-3 py-2 text-xs font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
        >
          코드 확인
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-mystery-800 bg-dark-900 p-5 text-center space-y-3">
      <div className="flex items-start justify-between gap-3 text-left">
        <div>
          <p className="text-xs text-dark-500">참가 코드</p>
          <p className="mt-1 text-sm font-medium text-dark-100">{sessionName}</p>
          {!isLobby ? (
            <p className="mt-1 text-xs text-dark-600">진행 중에는 필요할 때만 다시 펼쳐 확인합니다.</p>
          ) : null}
        </div>
        {!isLobby ? (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="rounded-xl border border-dark-700 px-3 py-2 text-xs font-medium text-dark-200 transition-colors hover:border-dark-500 hover:text-dark-50"
          >
            접기
          </button>
        ) : null}
      </div>

      <p className="text-5xl font-mono font-black tracking-widest text-mystery-300">
        {sessionCode}
      </p>

      <button
        type="button"
        onClick={copyCode}
        className="rounded-xl border border-mystery-700 bg-mystery-900/30 px-4 py-2 text-sm font-medium text-mystery-100 transition-colors hover:bg-mystery-800/40"
      >
        {codeCopied ? "복사됨" : "코드 복사"}
      </button>

      {joinUrl ? (
        <div className="border-t border-dark-800 pt-3 space-y-2">
          <p className="text-xs text-dark-500">참가 링크</p>
          <p className="text-xs break-all font-mono text-emerald-400">{joinUrl}</p>
          <button
            type="button"
            onClick={() => copyUrl(joinUrl)}
            className="w-full rounded-xl border border-emerald-800 bg-emerald-900/30 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-900/50"
          >
            {urlCopied ? "복사됨" : "링크 복사"}
          </button>
        </div>
      ) : (
        <div className="border-t border-dark-800 pt-3">
          <p className="text-xs text-dark-600">
            참가 링크 없음 — <span className="text-dark-500"><code>npm run dev:tunnel</code> 로 시작하면 활성화</span>
          </p>
        </div>
      )}
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
  const [sessionCode, setSessionCode] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [inventory, setInventory] = useState<InventoryCard[]>([]);
  const [roundAcquired, setRoundAcquired] = useState<Record<string, number>>({});
  const [roundVisited, setRoundVisited] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("character");
  const [characterPanel, setCharacterPanel] = useState<CharacterPanel>("profile");
  const [acquiring, setAcquiring] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<InventoryCard | null>(null);
  const [selectedSceneClue, setSelectedSceneClue] = useState<Clue | null>(null);
  const previousPhaseRef = useRef<string | null>(null);
  const [phaseRequestSubmitting, setPhaseRequestSubmitting] = useState(false);
  const [phaseAdvanceConfirmKind, setPhaseAdvanceConfirmKind] = useState<SessionAdvanceConfirmKind | null>(null);

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
      const { sharedState: ss, playerState, game: g, sessionCode: nextSessionCode, sessionName: nextSessionName } = await sessionRes.json();
      setSharedState(ss);
      setSessionCode(nextSessionCode ?? "");
      setSessionName(nextSessionName ?? "현재 방");
      setInventory(playerState.inventory ?? []);
      setRoundAcquired(playerState.roundAcquired ?? {});
      setRoundVisited(playerState.roundVisitedLocations ?? {});
      setGame(g);
      setLoading(false);
    }
    fetchState();
  }, [token, sessionId, gameId]);

  useEffect(() => {
    if (!game || !sharedState) {
      setPhaseAdvanceConfirmKind(null);
      return;
    }

    const nextConfirmKind = getAdvanceConfirmKind({ sharedState }, game);
    if (phaseAdvanceConfirmKind && nextConfirmKind !== phaseAdvanceConfirmKind) {
      setPhaseAdvanceConfirmKind(null);
    }
  }, [game, phaseAdvanceConfirmKind, sharedState]);

  // 페이즈 변화가 눈에 띄도록 본게임 진입 시 장소 탐색, 투표 진입 시 투표 탭으로 이동한다.
  useEffect(() => {
    const nextPhase = sharedState?.phase;
    if (!nextPhase) return;

    const previousPhase = previousPhaseRef.current;

    if (nextPhase === "vote") {
      setTab("vote");
    } else if (nextPhase.startsWith("round-") && previousPhase !== nextPhase) {
      setTab("locations");
    }

    previousPhaseRef.current = nextPhase;
  }, [sharedState?.phase]);

  // 폴링 fallback — SSE가 프록시에 버퍼링될 때 3초마다 상태 동기화
  useEffect(() => {
    if (!token || !sessionId) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}?token=${token}`);
        if (!res.ok) return;
        const { sharedState: ss, playerState, sessionCode: nextSessionCode, sessionName: nextSessionName } = await res.json();
        setSharedState(ss);
        setSessionCode(nextSessionCode ?? "");
        setSessionName(nextSessionName ?? "현재 방");
        setInventory(playerState.inventory ?? []);
        setRoundAcquired(playerState.roundAcquired ?? {});
        setRoundVisited(playerState.roundVisitedLocations ?? {});
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [token, sessionId]);

  useSSE(
    sessionId && token ? `/api/sessions/${sessionId}/events?token=${encodeURIComponent(token)}` : null,
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

  async function submitPhaseAdvanceRequest(action: "request" | "withdraw") {
    setPhaseRequestSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/phase-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "진행 요청 처리 실패");
        return false;
      }

      const data = await res.json() as { sharedState?: SharedState };
      if (data.sharedState) {
        setSharedState(data.sharedState);
      }
      return true;
    } catch {
      alert("진행 요청 처리 중 오류가 발생했습니다.");
      return false;
    } finally {
      setPhaseRequestSubmitting(false);
    }
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
  const endingStage = normalizeEndingStage(sharedState.endingStage);
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
  const requestedPlayerIds = sharedState.phaseAdvanceRequestPlayerIds ?? [];
  const hasRequestedAdvance = requestedPlayerIds.includes(charId);
  const canRequestAdvance = phase !== "vote" && phase !== "ending";
  const advanceRequestLabel = getPlayerAdvanceRequestLabel({ sharedState }, game);

  async function handlePhaseAdvanceToggle() {
    if (!sharedState || !game) {
      return;
    }

    if (hasRequestedAdvance) {
      void submitPhaseAdvanceRequest("withdraw");
      return;
    }

    const confirmKind = getAdvanceConfirmKind({ sharedState }, game);
    if (confirmKind) {
      setPhaseAdvanceConfirmKind(confirmKind);
      return;
    }

    void submitPhaseAdvanceRequest("request");
  }

  async function confirmPhaseAdvanceRequest() {
    const ok = await submitPhaseAdvanceRequest("request");
    if (ok) {
      setPhaseAdvanceConfirmKind(null);
    }
  }

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
            {ENDING_STAGE_LABELS[endingStage]}
          </span>
        </div>
        <div className="p-4 max-w-lg mx-auto pb-8">
          <VoteResultScreen
            reveal={sharedState.voteReveal}
            game={game}
            myPlayerId={charId}
            endingStage={endingStage}
          />
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; hidden?: boolean }[] = [
    { id: "character", label: "캐릭터 카드" },
    { id: "inventory", label: `인벤토리 (${inventory.length})` },
    { id: "locations", label: "장소 탐색" },
    { id: "vote", label: "투표", hidden: phase !== "vote" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-dark-950 text-dark-100">
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
        {phase === "lobby" && sessionCode && (
          <PlayerJoinAccessPanel
            sessionName={sessionName || "현재 방"}
            sessionCode={sessionCode}
            isLobby={phase === "lobby"}
          />
        )}

        {phase === "lobby" && canRequestAdvance && (
          <PhaseAdvanceRequestPanel
            label={advanceRequestLabel}
            requestedCount={requestedPlayerIds.length}
            totalCount={joinedSlots.length}
            requested={hasRequestedAdvance}
            submitting={phaseRequestSubmitting}
            onToggle={handlePhaseAdvanceToggle}
          />
        )}

        {/* 오프닝 페이즈 — 도입 배너 */}
        {phase === "opening" && (
          <div className="space-y-3">
            <div className="bg-mystery-950/40 border border-mystery-800 rounded-2xl p-5 space-y-4">
              <div className="text-center">
                <p className="text-xs text-mystery-500 mb-1">오프닝</p>
                <p className="text-xl font-bold text-dark-50">{game.title}</p>
              </div>
              {game.scripts.opening.narration && (
                <div className="border-t border-mystery-900 pt-4">
                  <p className="text-xs text-mystery-500 mb-2">스토리 텍스트</p>
                  <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
                    {game.scripts.opening.narration}
                  </p>
                </div>
              )}
            </div>
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
              <p className="text-xs text-dark-500 mb-1">내 캐릭터</p>
              <p className="font-bold text-dark-50">{character.name}</p>
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
            <div className="flex gap-1 bg-dark-900 p-1 rounded-xl border border-dark-800">
              {(["profile", "people", "timeline"] as CharacterPanel[]).map((panel) => {
                const disabled = panel === "timeline" && (!game.story.timeline.enabled || game.story.timeline.slots.length === 0);
                if (disabled) return null;

                return (
                  <button
                    key={panel}
                    type="button"
                    onClick={() => setCharacterPanel(panel)}
                    className={[
                      "flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors",
                      characterPanel === panel
                        ? "bg-dark-700 text-dark-50"
                        : "text-dark-500 hover:text-dark-300",
                    ].join(" ")}
                  >
                    {CHARACTER_PANEL_LABELS[panel]}
                  </button>
                );
              })}
            </div>

            {characterPanel === "profile" && (
              <div className="space-y-4">
                {character.cardImage ? (
                  <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-3">
                    <p className="text-xs text-dark-500">이미지</p>
                    <ImageFrame
                      src={character.cardImage}
                      alt={character.name || "캐릭터 이미지"}
                      variant="portrait"
                    />
                  </div>
                ) : null}
                <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-dark-500">배경</p>
                  <p className="text-sm text-dark-200 leading-relaxed whitespace-pre-line">
                    {character.background || "입력된 배경이 없습니다."}
                  </p>
                </div>
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
                {character.scoreConditions.length > 0 ? (
                  <CollapsibleSection title="승점 조건">
                    {character.scoreConditions.map((sc, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-dark-300">{sc.description}</span>
                        <span className="text-mystery-400 font-bold shrink-0">+{sc.points}점</span>
                      </div>
                    ))}
                  </CollapsibleSection>
                ) : null}
                {character.relatedClues.length > 0 ? (
                  <CollapsibleSection title="나와 관련된 단서 (위치 정보)">
                    {character.relatedClues.map((rc, i) => {
                      const clue = game.clues.find((c) => c.id === rc.clueId);
                      return (
                        <div key={i} className="border-l-2 border-dark-700 pl-3">
                          <p className="text-sm text-dark-300 font-medium">{clue?.title ?? "(알 수 없는 단서)"}</p>
                          {rc.note ? (
                            <p className="text-xs text-dark-500 mt-0.5 whitespace-pre-line">{rc.note}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </CollapsibleSection>
                ) : null}
              </div>
            )}

            {characterPanel === "people" && <PersonInfoPanel game={game} currentPlayer={character} />}

            {characterPanel === "timeline" && (
              <TimelinePanel
                game={game}
                character={character}
              />
            )}
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
                          variant="document"
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
                    const locClues = game.clues.filter((c) => c.locationId === loc.id);
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
                        <div className="px-4 py-3 bg-dark-800/60 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <span className={`min-w-0 break-words text-sm font-medium ${locationLocked ? "text-dark-400" : "text-dark-100"}`}>
                              {loc.name}
                            </span>
                            <span className="shrink-0 text-xs text-dark-600">단서 {locClues.length}개</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
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
                          </div>
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
                          <p className="px-4 pt-3 text-xs leading-relaxed break-words text-dark-500">{loc.description}</p>
                        )}
                        <div className="p-3 space-y-2">
                          {locClues.length === 0 ? (
                            <p className="text-xs text-dark-700 text-center py-2">단서 없음</p>
                          ) : (
                            locClues.map((clue, idx) => {
                              const isSceneClue = clue.type === "scene";
                              const alreadyHas = inventoryIds.has(clue.id);
                              const takenByOther = !isSceneClue && !alreadyHas && globalAcquired.includes(clue.id);

                              // 단서 획득 조건 체크
                              const clueCondMet = checkConditionLocally(clue.condition);
                              const clueLocked = !isSceneClue && clueCondMet === false; // has_items 조건이 명확히 미충족

                              return (
                                <div
                                  key={clue.id}
                                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                                    isSceneClue
                                      ? "border-sky-900/50 bg-sky-950/10"
                                      : alreadyHas
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
                                    {isSceneClue ? (
                                      <>
                                        <p className="text-sm font-medium break-words text-sky-300">
                                          {clue.title || `현장 단서 ${idx + 1}`}
                                        </p>
                                        <p className="text-xs text-dark-500 mt-0.5">공개 정보 · 획득되지 않음</p>
                                      </>
                                    ) : alreadyHas ? (
                                      <p className="text-sm font-medium break-words text-mystery-300">
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
                                          <p className="text-xs mt-0.5 break-words text-yellow-500/80">{clue.condition.hint}</p>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm text-dark-500">? 카드 #{idx + 1}</p>
                                        <p className="text-xs text-dark-700">획득 후 내용 확인 가능</p>
                                      </>
                                    )}
                                  </div>
                                  {isSceneClue ? (
                                    <button
                                      onClick={() => setSelectedSceneClue(clue)}
                                      disabled={locationLocked}
                                      className="text-xs px-3 py-1.5 rounded-lg bg-sky-900/50 hover:bg-sky-900/70 text-sky-200 border border-sky-800 shrink-0 transition-colors disabled:opacity-40"
                                    >
                                      내용 확인
                                    </button>
                                  ) : alreadyHas ? (
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

        {phase !== "lobby" && canRequestAdvance && (
          <PhaseAdvanceRequestPanel
            label={advanceRequestLabel}
            requestedCount={requestedPlayerIds.length}
            totalCount={joinedSlots.length}
            requested={hasRequestedAdvance}
            submitting={phaseRequestSubmitting}
            onToggle={handlePhaseAdvanceToggle}
          />
        )}

        {phase !== "lobby" && sessionCode && (
          <PlayerJoinAccessPanel
            sessionName={sessionName || "현재 방"}
            sessionCode={sessionCode}
            isLobby={false}
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

      {selectedSceneClue && (
        <SceneClueModal
          clue={selectedSceneClue}
          onClose={() => setSelectedSceneClue(null)}
        />
      )}

      {phaseAdvanceConfirmKind && (
        <PlayerAdvanceConfirmModal
          kind={phaseAdvanceConfirmKind}
          joinedPlayerCount={joinedSlots.length}
          totalPlayerCount={game.players.length}
          onCancel={() => setPhaseAdvanceConfirmKind(null)}
          onConfirm={() => { void confirmPhaseAdvanceRequest(); }}
          confirming={phaseRequestSubmitting}
        />
      )}
    </div>
  );
}
