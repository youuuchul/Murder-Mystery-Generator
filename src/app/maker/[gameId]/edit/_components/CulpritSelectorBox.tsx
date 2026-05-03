"use client";

import {
  CULPRIT_VICTIM_ID,
  formatCulpritLabel,
  resolveCulpritIdentity,
} from "@/lib/culprit";
import type { Player, Story, VoteQuestion } from "@/types/game";

/**
 * 범인 지정 셀렉트.
 *
 * 위쪽에 후보군 모드 토글(플레이어만 / 플레이어 + NPC + 피해자)을 두고,
 * 같은 값을 투표 탭의 주 질문 `targetMode` 와 동기화한다.
 * 즉 여기서 모드를 바꾸면 투표 탭의 1차 투표 대상도 같이 갱신되고, 반대도 동일.
 *
 * 이미 NPC/피해자 가 범인으로 저장돼 있으면(레거시 데이터 포함) 모드를 자동으로 확장 모드로 띄운다.
 */
export default function CulpritSelectorBox({
  story,
  syncedPlayers,
  voteQuestions,
  onChangeCulprit,
  onChangeCulpritScope,
}: {
  story: Story;
  syncedPlayers: Player[];
  voteQuestions: VoteQuestion[];
  onChangeCulprit: (culpritId: string) => void;
  onChangeCulpritScope: (mode: "players-only" | "players-and-npcs") => void;
}) {
  const culpritIdentity = resolveCulpritIdentity(story.culpritPlayerId, syncedPlayers, story);
  const victimName = story.victim?.name?.trim() ?? "";
  const npcOptions = (story.npcs ?? []).filter((n) => (n.name ?? "").trim().length > 0);
  const noCandidates = syncedPlayers.length === 0 && !victimName && npcOptions.length === 0;
  const staleCulpritId = story.culpritPlayerId && !culpritIdentity ? story.culpritPlayerId : null;

  const primaryQuestion = voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);
  const primaryMode = primaryQuestion?.targetMode;

  const requiresExpanded = (culpritIdentity && culpritIdentity.kind !== "player") || primaryMode === "custom-choices";
  const effectiveMode: "players-only" | "players-and-npcs" =
    requiresExpanded ? "players-and-npcs"
    : primaryMode === "players-and-npcs" ? "players-and-npcs"
    : "players-only";

  function handleChangeMode(next: "players-only" | "players-and-npcs") {
    if (next === "players-only" && culpritIdentity && culpritIdentity.kind !== "player") {
      onChangeCulprit("");
    }
    onChangeCulpritScope(next);
  }

  function handleChangeCulprit(nextId: string) {
    if (!nextId) {
      onChangeCulprit("");
      return;
    }
    const isNonPlayer = nextId === CULPRIT_VICTIM_ID || npcOptions.some((n) => n.id === nextId);
    if (isNonPlayer && primaryMode !== "players-and-npcs") {
      onChangeCulpritScope("players-and-npcs");
    }
    onChangeCulprit(nextId);
  }

  const showVictimGroup = effectiveMode === "players-and-npcs";
  const showNpcGroup = effectiveMode === "players-and-npcs";

  return (
    <div data-maker-anchor="step-5-culprit" className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dark-100">범인 지정</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-dark-400">범인 후보군</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleChangeMode("players-only")}
            disabled={primaryMode === "custom-choices"}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              effectiveMode === "players-only"
                ? "border-mystery-600 bg-mystery-950/40 text-mystery-200"
                : "border-dark-700 bg-dark-800/40 text-dark-400 hover:border-dark-500",
              primaryMode === "custom-choices" ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            플레이어만
          </button>
          <button
            type="button"
            onClick={() => handleChangeMode("players-and-npcs")}
            disabled={primaryMode === "custom-choices"}
            className={[
              "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              effectiveMode === "players-and-npcs"
                ? "border-mystery-600 bg-mystery-950/40 text-mystery-200"
                : "border-dark-700 bg-dark-800/40 text-dark-400 hover:border-dark-500",
              primaryMode === "custom-choices" ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            플레이어 + NPC + 피해자
          </button>
        </div>
        {primaryMode === "custom-choices" && (
          <p className="text-[11px] text-dark-500">
            커스텀 선택지 모드에서는 전체 인물을 표시합니다.
          </p>
        )}
      </div>

      <select
        value={story.culpritPlayerId}
        onChange={(e) => handleChangeCulprit(e.target.value)}
        className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm"
      >
        <option value="">— 범인을 선택하세요 —</option>

        <optgroup label="플레이어">
          {syncedPlayers.length === 0 ? (
            <option value="" disabled>
              플레이어를 먼저 추가하세요
            </option>
          ) : (
            syncedPlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name || "(이름 없음)"}
              </option>
            ))
          )}
        </optgroup>

        {showVictimGroup && (
          <optgroup label="피해자">
            {victimName ? (
              <option value={CULPRIT_VICTIM_ID}>{victimName}</option>
            ) : (
              <option value="" disabled>
                (피해자 이름 미입력 — 사건 개요 탭에서 설정 가능)
              </option>
            )}
          </optgroup>
        )}

        {showNpcGroup && (
          <optgroup label="NPC">
            {npcOptions.length === 0 ? (
              <option value="" disabled>
                (NPC 없음 — 필요할 때만 사건 개요 탭에서 추가)
              </option>
            ) : (
              npcOptions.map((npc) => (
                <option key={npc.id} value={npc.id}>
                  {npc.name}
                </option>
              ))
            )}
          </optgroup>
        )}

        {staleCulpritId && (
          <option value={staleCulpritId} disabled>
            (삭제된 캐릭터)
          </option>
        )}
      </select>

      {noCandidates ? (
        <p className="text-xs text-dark-600">
          선택 가능한 인물이 없습니다.
        </p>
      ) : culpritIdentity ? (
        <p className="text-xs text-mystery-400">
          선택됨: {formatCulpritLabel(culpritIdentity)}
        </p>
      ) : staleCulpritId ? (
        <p className="text-xs text-red-300">
          기존에 지정한 범인이 삭제됐습니다. 다시 선택해 주세요.
        </p>
      ) : (
        <p className="text-xs text-yellow-300">아직 범인이 지정되지 않았습니다.</p>
      )}
    </div>
  );
}
