"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import ImageAssetField from "./ImageAssetField";
import {
  CULPRIT_VICTIM_ID,
  buildPlayersNpcsVictimTargets,
  formatCulpritLabel,
  resolveCulpritIdentity,
} from "@/lib/culprit";
import type {
  Player,
  Clue,
  Location,
  Story,
  VictoryCondition,
  ScoreCondition,
  ScoreConditionType,
  RelatedClueRef,
  Relationship,
  StoryTimeline,
  TimelineSlot,
  PlayerTimelineEntry,
  VoteQuestion,
} from "@/types/game";

interface PlayerEditorProps {
  gameId: string;
  players: Player[];
  clues: Clue[];
  locations: Location[];
  story: Story;
  timeline: StoryTimeline;
  voteQuestions: VoteQuestion[];
  onChange: (players: Player[]) => void;
  onChangeTimeline: (timeline: StoryTimeline) => void;
  onChangeVoteQuestions: (next: VoteQuestion[]) => void;
  onChangeCulprit: (playerId: string) => void;
  /**
   * 범인 후보군 모드 변경 콜백.
   * "players-only" → 플레이어만, "players-and-npcs" → 플레이어 + NPC + 피해자.
   * 투표 탭의 주 질문 targetMode 와 동기화된다.
   */
  onChangeCulpritScope: (mode: "players-only" | "players-and-npcs") => void;
  focusTarget?: string | null;
  focusToken?: number;
}

interface RelationTargetOption {
  value: string;
  label: string;
}

interface ClueOption {
  id: string;
  label: string;
}

interface ClueOptionGroup {
  key: string;
  label: string;
  options: ClueOption[];
}

const VICTORY_OPTIONS: { value: VictoryCondition; label: string; desc: string; color: string }[] = [
  { value: "avoid-arrest", label: "검거 회피", desc: "범인 — 끝까지 들키지 마세요", color: "border-red-700 bg-red-950/30 text-red-300" },
  { value: "uncertain", label: "검거 or 회피", desc: "미확정 — 스스로도 확신할 수 없습니다", color: "border-yellow-700 bg-yellow-950/30 text-yellow-300" },
  { value: "arrest-culprit", label: "범인 검거", desc: "무고 — 진범을 찾아내세요", color: "border-blue-700 bg-blue-950/30 text-blue-300" },
  { value: "personal-goal", label: "개인 목표", desc: "별도 목표 달성이 우선", color: "border-purple-700 bg-purple-950/30 text-purple-300" },
];

const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";
const ta = inp + " resize-none";
const DEFAULT_TIMELINE_SLOT_LABELS = ["19:00", "19:30", "20:00", "20:30"];

/** 메이커 편집기에서 새 캐릭터를 추가할 때 사용하는 기본 템플릿이다. */
function createPlayer(): Player {
  return {
    id: crypto.randomUUID(),
    name: "",
    victoryCondition: "arrest-culprit",
    personalGoal: "",
    scoreConditions: [{
      description: "범인 검거 성공",
      points: 3,
      type: "culprit-outcome",
      config: { expectedOutcome: "arrested" },
    }],
    background: "",
    story: "",
    secret: "",
    timelineEntries: [],
    relatedClues: [],
    relationships: [],
  };
}

/** 플레이어 탭에서 새 시간대 슬롯을 만들 때 쓰는 기본값이다. */
function createTimelineSlot(label = ""): TimelineSlot {
  return {
    id: crypto.randomUUID(),
    label,
  };
}

/** 타임라인을 처음 켤 때 바로 입력 가능한 기본 시간대 슬롯 세트를 만든다. */
function createDefaultTimelineSlots(): TimelineSlot[] {
  return DEFAULT_TIMELINE_SLOT_LABELS.map((label) => createTimelineSlot(label));
}

/**
 * select value 형태의 `targetType:targetId` 문자열을 관계 데이터 구조로 풀어낸다.
 * 관계 추가 버튼과 드롭다운 변경이 같은 기준을 쓰도록 공용화한다.
 */
function parseRelationTargetValue(value?: string): Pick<Relationship, "targetType" | "targetId" | "playerId"> {
  if (!value) {
    return {
      targetType: "player",
      targetId: "",
      playerId: "",
    };
  }

  const [targetTypeRaw, targetId = ""] = value.split(":");
  const targetType = targetTypeRaw === "victim" || targetTypeRaw === "npc"
    ? targetTypeRaw
    : "player";

  return {
    targetType,
    targetId,
    playerId: targetType === "player" ? targetId : undefined,
  };
}

/** 관계 대상 비교용 select value를 만든다. legacy playerId 데이터도 같은 기준으로 정규화한다. */
function getRelationshipTargetValue(relationship: Relationship): string {
  const targetType = relationship.targetType ?? "player";
  const targetId = relationship.targetId || relationship.playerId || "";
  return targetId ? `${targetType}:${targetId}` : "";
}

/**
 * 현재 타임라인 슬롯 목록에 맞춰 플레이어 행동 타임라인을 정렬한다.
 * 슬롯이 추가/삭제돼도 중앙 타임라인 편집기와 플레이어 화면이 같은 순서를 유지한다.
 */
function alignTimelineEntries(player: Player, timeline: StoryTimeline): Player {
  return {
    ...player,
    timelineEntries: timeline.slots.map((slot) => {
      const existing = player.timelineEntries.find((entry) => entry.slotId === slot.id);
      return {
        slotId: slot.id,
        action: existing?.action ?? "",
        inactive: existing?.inactive === true,
      };
    }),
  };
}

/**
 * 중앙 타임라인 탭에서 사용 여부를 전환한다.
 * 처음 켤 때 슬롯이 비어 있으면 기본 시간대를 자동으로 생성해 바로 입력을 시작할 수 있게 한다.
 */
function TimelineUsageToggle({
  timeline,
  onChange,
}: {
  timeline: StoryTimeline;
  onChange: (timeline: StoryTimeline) => void;
}) {
  function toggleTimeline(enabled: boolean) {
    onChange({
      ...timeline,
      enabled,
      slots: enabled && timeline.slots.length === 0
        ? createDefaultTimelineSlots()
        : timeline.slots,
    });
  }

  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-dark-100">행동 타임라인 사용</p>
          <p className="mt-1 text-xs text-dark-500">
            시간대 슬롯 관리와 캐릭터별 행동 입력은 이 중앙 타임라인 탭에서 함께 진행합니다.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleTimeline(false)}
            className={[
              "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              !timeline.enabled
                ? "border-dark-500 bg-dark-800 text-dark-100"
                : "border-dark-700 text-dark-500 hover:text-dark-300",
            ].join(" ")}
          >
            사용 안 함
          </button>
          <button
            type="button"
            onClick={() => toggleTimeline(true)}
            className={[
              "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              timeline.enabled
                ? "border-mystery-600 bg-mystery-900/30 text-mystery-200"
                : "border-dark-700 text-dark-500 hover:text-dark-300",
            ].join(" ")}
          >
            사용
          </button>
        </div>
      </div>
      <p className="text-xs text-dark-600">
        {timeline.enabled
          ? `현재 사용 중 · 시간대 슬롯 ${timeline.slots.length}개`
          : "현재 사용하지 않습니다. 켜면 기본 시간대 슬롯을 만들고 캐릭터별 행동 입력을 활성화합니다."}
      </p>
    </div>
  );
}

/** 중앙 타임라인 셀에서 쓰는 상태 라벨과 입력 컨트롤을 한 곳으로 모은다. */
function TimelineEntryInput({
  player,
  slot,
  entry,
  showPlayerName = false,
  compact = false,
  onUpdateAction,
  onUpdateInactive,
}: {
  player: Player;
  slot: TimelineSlot;
  entry?: PlayerTimelineEntry;
  showPlayerName?: boolean;
  compact?: boolean;
  onUpdateAction: (playerId: string, slotId: string, action: string) => void;
  onUpdateInactive: (playerId: string, slotId: string, inactive: boolean) => void;
}) {
  const isInactive = entry?.inactive === true;
  const isFilled = (entry?.action ?? "").trim().length > 0;
  const statusLabel = isInactive ? "비활성" : isFilled ? "입력됨" : "미입력";
  const statusClass = isInactive
    ? "text-dark-500"
    : isFilled
      ? "text-emerald-400/80"
      : "text-amber-400/80";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {showPlayerName ? (
          <p className={[
            "text-sm font-medium",
            isInactive ? "text-dark-500 line-through" : "text-dark-100",
          ].join(" ")}>
            {player.name || "이름 없는 캐릭터"}
          </p>
        ) : (
          <span className={`text-[11px] ${statusClass}`}>{statusLabel}</span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {showPlayerName && (
            <span className={`text-[11px] ${statusClass}`}>{statusLabel}</span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={isInactive}
            onClick={() => onUpdateInactive(player.id, slot.id, !isInactive)}
            title={isInactive
              ? "비활성 해제 — 이 캐릭터가 이 시간대에 행동하게 설정"
              : "비활성으로 설정 — 이 캐릭터는 이 시간대에 등장/행동 없음"}
            className={[
              "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              isInactive
                ? "border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500"
                : "border-dark-700 bg-dark-900 text-dark-500 hover:border-dark-500 hover:text-dark-300",
            ].join(" ")}
          >
            {isInactive ? "비활성 ◉" : "활성 ◯"}
          </button>
        </div>
      </div>
      <textarea
        rows={compact ? 2 : 3}
        value={entry?.action ?? ""}
        onChange={(e) => onUpdateAction(player.id, slot.id, e.target.value)}
        placeholder={isInactive
          ? "비활성 상태: 입력한 내용은 보존됩니다."
          : "예: 서재에서 유언장을 찾다가 복도로 이동했다."}
        disabled={isInactive}
        className={[
          ta,
          compact ? "min-h-[5.75rem]" : "",
          isInactive ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      />
    </div>
  );
}

/** 플레이어별/시간대별 행동을 한 화면에서 비교할 수 있는 상단 통합 표다. */
function TimelineOverviewTable({
  players,
  timeline,
  onUpdateAction,
  onUpdateInactive,
}: {
  players: Player[];
  timeline: StoryTimeline;
  onUpdateAction: (playerId: string, slotId: string, action: string) => void;
  onUpdateInactive: (playerId: string, slotId: string, inactive: boolean) => void;
}) {
  return (
    <section className="rounded-xl border border-dark-700 bg-dark-950/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dark-100">전체 타임라인 표</p>
          <p className="mt-1 text-xs text-dark-500">캐릭터와 시간대를 한 번에 비교합니다.</p>
        </div>
        <span className="rounded-full border border-dark-700 px-3 py-1 text-xs text-dark-400 shrink-0">
          {players.length}명 · {timeline.slots.length}개
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-dark-800">
        <table className="w-full min-w-[960px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-44 bg-dark-950 px-3 py-3 text-left text-xs font-medium text-dark-500">
                캐릭터
              </th>
              {timeline.slots.map((slot) => (
                <th
                  key={slot.id}
                  className="min-w-[230px] border-l border-dark-800 bg-dark-950 px-3 py-3 text-left text-xs font-medium text-dark-400"
                >
                  {slot.label || "이름 없는 슬롯"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="align-top">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-dark-800 bg-dark-950 px-3 py-3 text-left align-top"
                >
                  <p className="text-sm font-semibold text-dark-100">{player.name || "이름 없는 캐릭터"}</p>
                </th>
                {timeline.slots.map((slot) => (
                  <td
                    key={slot.id}
                    className="border-l border-t border-dark-800 bg-dark-900/40 px-3 py-3 align-top"
                  >
                    <TimelineEntryInput
                      player={player}
                      slot={slot}
                      entry={player.timelineEntries.find((item) => item.slotId === slot.id)}
                      compact
                      onUpdateAction={onUpdateAction}
                      onUpdateInactive={onUpdateInactive}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * 제작자가 시간대별로 모든 캐릭터 행동을 한 곳에서 입력하도록 돕는 중앙 타임라인 편집기다.
 * 슬롯마다 플레이어 전체를 나열해 알리바이 충돌을 한눈에 비교할 수 있게 한다.
 */
function TimelineMatrixEditor({
  players,
  timeline,
  onChange,
}: {
  players: Player[];
  timeline: StoryTimeline;
  onChange: (players: Player[]) => void;
}) {
  function updateTimelineAction(playerId: string, slotId: string, action: string) {
    onChange(
      players.map((player) => (
        player.id === playerId
          ? {
              ...player,
              timelineEntries: player.timelineEntries.map((entry) => (
                entry.slotId === slotId ? { ...entry, action } : entry
              )),
            }
          : player
      ))
    );
  }

  function updateTimelineInactive(playerId: string, slotId: string, inactive: boolean) {
    onChange(
      players.map((player) => (
        player.id === playerId
          ? {
              ...player,
              timelineEntries: player.timelineEntries.map((entry) => (
                entry.slotId === slotId
                  ? { ...entry, inactive }
                  : entry
              )),
            }
          : player
      ))
    );
  }

  if (!timeline.enabled) {
    return (
      <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl">
        <p className="text-dark-500 text-sm">타임라인 사용이 꺼져 있습니다.</p>
        <p className="text-xs text-dark-600 mt-1">상단에서 타임라인 사용을 켜면 시간대별 행동을 입력할 수 있습니다.</p>
      </div>
    );
  }

  if (timeline.slots.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl">
        <p className="text-dark-500 text-sm">아직 정의된 시간대 슬롯이 없습니다.</p>
        <p className="text-xs text-dark-600 mt-1">위 슬롯 관리에서 시간대를 추가하면 캐릭터별 행동 입력을 진행할 수 있습니다.</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl">
        <p className="text-dark-500 text-sm">플레이어를 먼저 추가하세요.</p>
        <p className="text-xs text-dark-600 mt-1">캐릭터가 있어야 시간대별 행동과 알리바이를 연결할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
        <p className="text-sm text-dark-300 font-medium">중앙 타임라인</p>
      </div>

      <TimelineOverviewTable
        players={players}
        timeline={timeline}
        onUpdateAction={updateTimelineAction}
        onUpdateInactive={updateTimelineInactive}
      />

      {timeline.slots.map((slot) => (
        <section key={slot.id} className="border border-dark-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-mystery-300">{slot.label || "이름 없는 슬롯"}</p>
            </div>
            <span className="text-xs text-dark-600 shrink-0">{players.length}명</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {players.map((player) => {
              const entry = player.timelineEntries.find((item) => item.slotId === slot.id);
              const isInactive = entry?.inactive === true;

              return (
                <div
                  key={player.id}
                  className={[
                    "rounded-xl p-3 space-y-2 border transition-colors",
                    isInactive
                      ? "border-dark-800 bg-dark-950/70"
                      : "border-dark-800 bg-dark-900/60",
                  ].join(" ")}
                >
                  <TimelineEntryInput
                    player={player}
                    slot={slot}
                    entry={entry}
                    showPlayerName
                    onUpdateAction={updateTimelineAction}
                    onUpdateInactive={updateTimelineInactive}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * 플레이어 행동 입력과 같은 문맥에서 시간대 슬롯도 바로 다루도록 돕는 관리 패널이다.
 * 슬롯 순서를 바꾸면 아래 행동 입력 순서도 같은 기준으로 따라간다.
 */
function TimelineSlotManager({
  timeline,
  onChange,
}: {
  timeline: StoryTimeline;
  onChange: (timeline: StoryTimeline) => void;
}) {
  function updateSlots(slots: TimelineSlot[]) {
    onChange({ ...timeline, slots });
  }

  function updateSlotLabel(slotId: string, label: string) {
    updateSlots(timeline.slots.map((slot) => (
      slot.id === slotId ? { ...slot, label } : slot
    )));
  }

  function moveSlot(slotId: string, direction: -1 | 1) {
    const currentIndex = timeline.slots.findIndex((slot) => slot.id === slotId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= timeline.slots.length) {
      return;
    }

    const nextSlots = [...timeline.slots];
    const [targetSlot] = nextSlots.splice(currentIndex, 1);
    nextSlots.splice(nextIndex, 0, targetSlot);
    updateSlots(nextSlots);
  }

  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dark-100">시간대 슬롯 관리</p>
          <p className="mt-1 text-xs text-dark-500">
            추가, 삭제, 순서 변경을 여기서 바로 처리합니다. 순서를 바꾸면 아래 행동 입력 순서도 같이 바뀝니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => updateSlots([...timeline.slots, createTimelineSlot()])}
          className="shrink-0 text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
        >
          + 시간대 슬롯 추가
        </button>
      </div>

      {timeline.slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
          <p className="text-xs text-dark-600">아직 정의된 시간대 슬롯이 없습니다. 첫 슬롯을 추가하세요.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.slots.map((slot, index) => (
            <div key={slot.id} className="rounded-xl border border-dark-700/70 bg-dark-950/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-dark-300">슬롯 {index + 1}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveSlot(slot.id, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-dark-700 px-2 py-1 text-[11px] text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100 disabled:opacity-30"
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlot(slot.id, 1)}
                    disabled={index === timeline.slots.length - 1}
                    className="rounded-lg border border-dark-700 px-2 py-1 text-[11px] text-dark-300 transition-colors hover:border-dark-500 hover:text-dark-100 disabled:opacity-30"
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSlots(timeline.slots.filter((item) => item.id !== slot.id))}
                    className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={slot.label}
                onChange={(event) => updateSlotLabel(slot.id, event.target.value)}
                placeholder="예: 20:00 ~ 20:30"
                className={inp}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerForm({
  gameId,
  player,
  clues,
  locations,
  relationTargets,
  voteQuestions,
  onChangeVoteQuestions,
  players,
  npcs,
  victim,
  isCulprit,
  onChange,
  onDelete,
}: {
  gameId: string;
  player: Player;
  clues: Clue[];
  locations: Location[];
  relationTargets: RelationTargetOption[];
  voteQuestions: VoteQuestion[];
  onChangeVoteQuestions: (next: VoteQuestion[]) => void;
  players: Player[];
  npcs: Story["npcs"];
  victim: Story["victim"] | undefined;
  isCulprit: boolean;
  onChange: (p: Player) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<"basic" | "score" | "clues" | "rel">("basic");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);

  function update<K extends keyof Player>(key: K, value: Player[K]) {
    onChange({ ...player, [key]: value });
  }

  /**
   * 플레이어 대표 이미지를 업로드하고 참가 선택/투표 화면에 사용할 URL을 캐릭터 데이터에 기록한다.
   * 저장 backend는 provider 설정을 따르며, 캐릭터 데이터에는 내부 에셋 URL만 남긴다.
   */
  async function handleCardImageUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "players");

    setUploadingImage(true);
    try {
      const res = await fetch(`/api/games/${gameId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? "플레이어 이미지 업로드 실패");
        return;
      }

      update("cardImage", data.url);
    } catch (error) {
      console.error("플레이어 이미지 업로드 실패:", error);
      alert("플레이어 이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingImage(false);
    }
  }

  function updateScore(idx: number, partial: Partial<ScoreCondition>) {
    update("scoreConditions", player.scoreConditions.map((s, i) => i === idx ? { ...s, ...partial } : s));
  }

  function updateRelatedClue(idx: number, partial: Partial<RelatedClueRef>) {
    update("relatedClues", player.relatedClues.map((r, i) => i === idx ? { ...r, ...partial } : r));
  }

  function updateRel(idx: number, partial: Partial<Relationship>) {
    update("relationships", player.relationships.map((r, i) => i === idx ? { ...r, ...partial } : r));
  }

  /** 관계 1개를 현재 캐릭터 카드에 추가한다. */
  function addRelationship() {
    const defaultTarget = getRelationTargetsForRow(-1)[0]?.value;
    update("relationships", [
      ...player.relationships,
      {
        ...parseRelationTargetValue(defaultTarget),
        description: "",
      },
    ]);
  }

  const conditionInfo = VICTORY_OPTIONS.find((v) => v.value === player.victoryCondition);
  const filteredRelationTargets = relationTargets.filter((target) => target.value !== `player:${player.id}`);
  const selectedRelationshipTargets = new Set(
    player.relationships
      .map(getRelationshipTargetValue)
      .filter(Boolean)
  );
  function getRelationTargetsForRow(rowIndex: number) {
    const currentValue = rowIndex >= 0
      ? getRelationshipTargetValue(player.relationships[rowIndex])
      : "";
    return filteredRelationTargets.filter((target) => (
      target.value === currentValue || !selectedRelationshipTargets.has(target.value)
    ));
  }
  const availableRelationTargetsToAdd = getRelationTargetsForRow(-1);
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const locationOrder = new Map(locations.map((location, index) => [location.id, index]));
  const clueOrderInLocation = new Map<string, number>();
  locations.forEach((location) => {
    location.clueIds.forEach((clueId, index) => {
      clueOrderInLocation.set(clueId, index);
    });
  });
  const clueOriginalOrder = new Map(clues.map((clue, index) => [clue.id, index]));
  const sortedClues = clues.slice().sort((a, b) => {
    const aLocationOrder = locationOrder.get(a.locationId) ?? Number.MAX_SAFE_INTEGER;
    const bLocationOrder = locationOrder.get(b.locationId) ?? Number.MAX_SAFE_INTEGER;
    if (aLocationOrder !== bLocationOrder) return aLocationOrder - bLocationOrder;

    const aClueOrder = clueOrderInLocation.get(a.id) ?? clueOriginalOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bClueOrder = clueOrderInLocation.get(b.id) ?? clueOriginalOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aClueOrder !== bClueOrder) return aClueOrder - bClueOrder;

    return (clueOriginalOrder.get(a.id) ?? 0) - (clueOriginalOrder.get(b.id) ?? 0);
  });
  const clueGroups = sortedClues.reduce<ClueOptionGroup[]>((groups, clue) => {
    const location = locationById.get(clue.locationId);
    const groupKey = location?.id ?? "unassigned";
    let group = groups.find((item) => item.key === groupKey);
    if (!group) {
      group = {
        key: groupKey,
        label: location?.name?.trim() || "위치 미지정",
        options: [],
      };
      groups.push(group);
    }
    group.options.push({
      id: clue.id,
      label: clue.title || "(제목 없음)",
    });
    return groups;
  }, []);
  const selectedRelatedClueIds = new Set(player.relatedClues.map((related) => related.clueId).filter(Boolean));
  function getRelatedClueGroupsForRow(rowIndex: number) {
    const currentClueId = rowIndex >= 0 ? player.relatedClues[rowIndex]?.clueId : "";
    return clueGroups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => option.id === currentClueId || !selectedRelatedClueIds.has(option.id)),
      }))
      .filter((group) => group.options.length > 0);
  }
  const availableRelatedCluesToAdd = getRelatedClueGroupsForRow(-1);

  const tabs = [
    { id: "basic" as const, label: "기본 정보" },
    { id: "score" as const, label: `승점 (${player.scoreConditions.length})` },
    { id: "clues" as const, label: `연관 단서 (${player.relatedClues.length})` },
    { id: "rel" as const, label: `관계 (${player.relationships.length})` },
  ];

  return (
    <div className="border border-dark-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/60 hover:bg-dark-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-dark-100 truncate">
            {player.name || <span className="text-dark-500 italic">이름 없음</span>}
          </span>
          {isCulprit && (
            <span className="shrink-0 rounded-full border border-red-800 bg-red-950/30 px-2 py-0.5 text-xs text-red-200">
              범인
            </span>
          )}
          {conditionInfo && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${conditionInfo.color} shrink-0`}>
              {conditionInfo.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-xs text-dark-500 hover:text-red-400 transition-colors px-2 py-1"
          >
            삭제
          </button>
          <span className="text-dark-500 text-sm">{expanded ? "접기" : "열기"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">캐릭터 이름 *</label>
              <input
                type="text"
                value={player.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="이름"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-2">승리 조건</label>
              <div className="grid grid-cols-2 gap-1.5">
                {VICTORY_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    title={v.desc}
                    onClick={() => update("victoryCondition", v.value)}
                    className={[
                      "px-2 py-2 rounded-lg border text-xs font-medium transition-all text-left leading-tight",
                      player.victoryCondition === v.value
                        ? v.color
                        : "border-dark-700 text-dark-500 hover:border-dark-500 hover:text-dark-300",
                    ].join(" ")}
                  >
                    {v.label}
                    <span className="block text-[10px] opacity-70 mt-0.5 font-normal">{v.desc}</span>
                  </button>
                ))}
              </div>
              {player.victoryCondition === "personal-goal" && (
                <input
                  type="text"
                  value={player.personalGoal ?? ""}
                  onChange={(e) => update("personalGoal", e.target.value)}
                  placeholder="개인 목표 설명 (예: 유언장 카드 획득)"
                  className={`${inp} mt-2`}
                />
              )}
            </div>
          </div>

          <div className="flex gap-1 bg-dark-800 p-1 rounded-lg">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  "flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap overflow-hidden text-ellipsis",
                  tab === t.id ? "bg-dark-600 text-dark-50" : "text-dark-500 hover:text-dark-300",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "basic" && (
            <div className="space-y-3">
              <ImageAssetField
                title="캐릭터 대표 이미지"
                description="참가 선택, 인물 정보, 투표 화면에 쓸 인물 사진입니다."
                value={player.cardImage}
                alt={player.name || "플레이어 캐릭터 이미지"}
                profile="portrait"
                onChange={(nextValue) => update("cardImage", nextValue)}
                onUpload={handleCardImageUpload}
                uploading={uploadingImage}
                uploadLabel="인물 이미지 업로드"
                emptyStateLabel="선택/투표 화면에 쓸 캐릭터 대표 이미지가 아직 없습니다."
              />
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">배경 (전원 공개)</label>
                <textarea
                  rows={3}
                  value={player.background}
                  onChange={(e) => update("background", e.target.value)}
                  placeholder="다른 플레이어에게도 공개되는 캐릭터 소개"
                  className={ta}
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-dark-400">
                    상세 스토리
                  </label>
                  <button
                    type="button"
                    onClick={() => setStoryExpanded((v) => !v)}
                    className="rounded-md border border-dark-700 bg-dark-900/60 px-2 py-1 text-[11px] text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-200"
                    aria-expanded={storyExpanded}
                  >
                    {storyExpanded ? "접기" : "펼치기"}
                  </button>
                </div>
                <textarea
                  rows={storyExpanded ? undefined : 5}
                  value={player.story}
                  onChange={(e) => update("story", e.target.value)}
                  placeholder="이 캐릭터가 알고 있는 사건 전후 맥락, 감정선, 의심하는 대상, 숨기고 싶은 사정을 자세히 적으세요."
                  className={`${ta} ${storyExpanded ? "min-h-[33vh]" : ""}`}
                />
                <p className="mt-1 text-[11px] text-dark-500">
                  시간대별 행동과 알리바이는 위쪽 중앙 타임라인 탭에서 따로 입력합니다.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">
                  비밀 정보
                </label>
                <textarea
                  rows={5}
                  value={player.secret}
                  onChange={(e) => update("secret", e.target.value)}
                  placeholder={"한 줄마다 ‘-’로 시작하는 간단한 사실 단위로 적으세요.\n예)\n- 피해자와 3주 전 금전 관계로 크게 다툼\n- 사건 당일 03:10 뒷문으로 몰래 진입\n- 진범은 아님. 다만 흉기를 숨겨줬음"}
                  className={ta}
                />
                <p className="mt-1 text-[11px] text-dark-500">
                  서술형 문단보다 ‘-’ 불릿형 사실 리스트가 GM/플레이어가 빠르게 훑기 좋고, AI 도우미가 문안을 뽑을 때도 구조를 재활용하기 쉽습니다.
                </p>
              </div>
            </div>
          )}

          {tab === "score" && (
            <ScoreConditionsEditor
              scoreConditions={player.scoreConditions}
              clues={clues}
              voteQuestions={voteQuestions}
              onChangeVoteQuestions={onChangeVoteQuestions}
              currentPlayerId={player.id}
              players={players}
              npcs={npcs}
              victim={victim}
              onUpdate={(idx, patch) => updateScore(idx, patch)}
              onAdd={() => update("scoreConditions", [...player.scoreConditions, { description: "", points: 1, type: "manual" }])}
              onDelete={(idx) => update("scoreConditions", player.scoreConditions.filter((_, i) => i !== idx))}
            />
          )}

          {tab === "clues" && (
            <div className="space-y-2">
              <p className="text-xs text-dark-500">
                이 캐릭터와 관련된 단서를 선택하고 설명을 작성하세요. 게임 시작 시 본인에게 공개됩니다.
              </p>
              {player.relatedClues.map((rc, idx) => {
                const groupsForRow = getRelatedClueGroupsForRow(idx);
                return (
                  <div key={idx} className="border border-dark-700/60 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={rc.clueId}
                        onChange={(e) => updateRelatedClue(idx, { clueId: e.target.value })}
                        className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-dark-200 text-xs focus:outline-none focus:ring-1 focus:ring-mystery-500"
                      >
                        <option value="">— 단서 선택 —</option>
                        {groupsForRow.map((group) => (
                          <optgroup key={group.key} label={group.label}>
                            {group.options.map((clue) => (
                              <option key={clue.id} value={clue.id}>
                                {clue.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => update("relatedClues", player.relatedClues.filter((_, i) => i !== idx))}
                        className="text-dark-500 hover:text-red-400 text-sm px-1 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    <input
                      type="text"
                      value={rc.note}
                      onChange={(e) => updateRelatedClue(idx, { note: e.target.value })}
                      placeholder="예: 당신의 방에 보관된 물건이지만 직접 접근할 수 없습니다."
                      className={inp}
                    />
                  </div>
                );
              })}
              {clues.length === 0 ? (
                <p className="text-xs text-dark-600 py-2">Step 4(장소 & 단서)에서 단서를 먼저 추가하세요.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => update("relatedClues", [...player.relatedClues, { clueId: "", note: "" }])}
                  disabled={availableRelatedCluesToAdd.length === 0}
                  title={availableRelatedCluesToAdd.length === 0 ? "모든 단서가 추가되었습니다." : undefined}
                  className="text-xs text-mystery-400 transition-colors hover:text-mystery-300 disabled:cursor-not-allowed disabled:text-dark-600"
                >
                  + 연관 단서 추가
                </button>
              )}
            </div>
          )}

          {tab === "rel" && (
            <div className="space-y-2">
              <p className="text-xs text-dark-500">
                피해자, 다른 캐릭터, NPC와의 관계를 적습니다. 새로 추가한 항목이 바로 보이도록 카드 형태로 표시합니다.
              </p>
              {player.relationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
                  <p className="text-xs text-dark-600">등록된 관계가 없습니다. 아래 버튼으로 첫 관계를 추가하세요.</p>
                </div>
              ) : (
                player.relationships.map((rel, idx) => {
                  const currentRelationValue = getRelationshipTargetValue(rel);
                  const targetsForRow = getRelationTargetsForRow(idx);
                  return (
                    <div key={idx} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-medium text-dark-300">관계 {idx + 1}</p>
                        <button
                          type="button"
                          onClick={() => update("relationships", player.relationships.filter((_, i) => i !== idx))}
                          className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                        >
                          삭제
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                        <select
                          value={currentRelationValue}
                          onChange={(e) => updateRel(idx, parseRelationTargetValue(e.target.value))}
                          className="w-full bg-dark-700 border border-dark-600 rounded px-2 py-2 text-dark-200 text-xs focus:outline-none focus:ring-1 focus:ring-mystery-500"
                        >
                          <option value="">대상 선택</option>
                          {targetsForRow.map((target) => (
                            <option key={target.value} value={target.value}>{target.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={rel.description}
                          onChange={(e) => updateRel(idx, { description: e.target.value })}
                          placeholder="예: 오래된 동업자였지만 최근 크게 다퉜다."
                          className="w-full bg-dark-800 border border-dark-600 rounded px-3 py-2 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-1 focus:ring-mystery-500 transition"
                        />
                      </div>
                    </div>
                  );
                })
              )}
              <button
                type="button"
                onClick={addRelationship}
                disabled={availableRelationTargetsToAdd.length === 0}
                title={availableRelationTargetsToAdd.length === 0 ? "모든 대상이 추가되었습니다." : undefined}
                className="text-xs text-mystery-400 transition-colors hover:text-mystery-300 disabled:cursor-not-allowed disabled:text-dark-600"
              >
                + 관계 추가
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayerEditor({
  gameId,
  players,
  clues,
  locations,
  story,
  timeline,
  voteQuestions,
  onChange,
  onChangeTimeline,
  onChangeVoteQuestions,
  onChangeCulprit,
  onChangeCulpritScope,
  focusTarget,
  focusToken,
}: PlayerEditorProps) {
  const [view, setView] = useState<"profiles" | "timeline">("profiles");
  const syncedPlayers = players.map((player) => alignTimelineEntries(player, timeline));
  const relationTargets: RelationTargetOption[] = [
    ...syncedPlayers.map((player) => ({
      value: `player:${player.id}`,
      label: `[플레이어] ${player.name || "(이름 없음)"}`,
    })),
    {
      value: "victim:victim",
      label: `[피해자] ${story.victim.name || "(이름 없음)"}`,
    },
    ...story.npcs.map((npc) => ({
      value: `npc:${npc.id}`,
      label: `[NPC] ${npc.name || "(이름 없음)"}`,
    })),
  ];

  useEffect(() => {
    if (!focusTarget) {
      return;
    }

    if (focusTarget === "step-3-timeline") {
      setView("timeline");
      return;
    }

    if (focusTarget.startsWith("step-3-")) {
      setView("profiles");
    }
  }, [focusTarget, focusToken, timeline.enabled]);

  return (
    <div className="space-y-6">
      <div data-maker-anchor="step-3-players" className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-dark-50">플레이어</h2>
          <p className="text-sm text-dark-500 mt-1">
            {players.length}명 등록 · 피해자는 사건 개요 탭에서 작성합니다.
          </p>
          <p className="text-xs text-dark-600 mt-1">
            {timeline.enabled
              ? `행동 타임라인 사용 중 · 시간대 슬롯 ${timeline.slots.length}개`
              : "행동 타임라인 사용 안 함 · 중앙 타임라인 탭에서 설정할 수 있습니다."}
          </p>
        </div>
        <Button size="sm" onClick={() => onChange([...players, createPlayer()])}>+ 플레이어 추가</Button>
      </div>

      <CulpritSelectorBox
        story={story}
        syncedPlayers={syncedPlayers}
        voteQuestions={voteQuestions}
        onChangeCulprit={onChangeCulprit}
        onChangeCulpritScope={onChangeCulpritScope}
      />

      <div className="flex gap-1 bg-dark-900 p-1 rounded-xl border border-dark-800">
        <button
          type="button"
          onClick={() => setView("profiles")}
          className={[
            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
            view === "profiles" ? "bg-dark-700 text-dark-50" : "text-dark-500 hover:text-dark-300",
          ].join(" ")}
        >
          캐릭터 정보
        </button>
        <button
          type="button"
          onClick={() => setView("timeline")}
          className={[
            "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
            view === "timeline" ? "bg-dark-700 text-dark-50" : "text-dark-500 hover:text-dark-300",
          ].join(" ")}
        >
          중앙 타임라인
        </button>
      </div>

      {view === "timeline" ? (
        <div data-maker-anchor="step-3-timeline" className="space-y-4">
          <TimelineUsageToggle
            timeline={timeline}
            onChange={onChangeTimeline}
          />
          {timeline.enabled && (
            <>
              <TimelineSlotManager
                timeline={timeline}
                onChange={onChangeTimeline}
              />
              <TimelineMatrixEditor
                players={syncedPlayers}
                timeline={timeline}
                onChange={onChange}
              />
            </>
          )}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-dark-700 rounded-xl">
          <p className="text-dark-500">등록된 플레이어가 없습니다.</p>
          <button
            type="button"
            onClick={() => onChange([...players, createPlayer()])}
            className="mt-2 text-sm text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + 첫 번째 플레이어 추가
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {syncedPlayers.map((player, idx) => (
            <PlayerForm
              key={player.id}
              gameId={gameId}
              player={player}
              clues={clues}
              locations={locations}
              relationTargets={relationTargets}
              voteQuestions={voteQuestions}
              onChangeVoteQuestions={onChangeVoteQuestions}
              players={syncedPlayers}
              npcs={story.npcs}
              victim={story.victim}
              isCulprit={player.id === story.culpritPlayerId}
              onChange={(updated) => onChange(players.map((p, i) => i === idx ? updated : p))}
              onDelete={() => onChange(players.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 승점 조건 편집 ─────────────────────────────────────────

const SCORE_TYPE_LABELS: Record<ScoreConditionType, string> = {
  manual: "수동 판정",
  "culprit-outcome": "범인 검거 결과",
  "clue-ownership": "단서 보유 여부",
  "vote-answer": "개인 투표 답변",
};

function ScoreConditionsEditor({
  scoreConditions,
  clues,
  voteQuestions,
  onChangeVoteQuestions,
  currentPlayerId,
  players,
  npcs,
  victim,
  onUpdate,
  onAdd,
  onDelete,
}: {
  scoreConditions: ScoreCondition[];
  clues: Clue[];
  voteQuestions: VoteQuestion[];
  onChangeVoteQuestions: (next: VoteQuestion[]) => void;
  currentPlayerId: string;
  players: Player[];
  npcs: Story["npcs"];
  victim: Story["victim"] | undefined;
  onUpdate: (idx: number, patch: Partial<ScoreCondition>) => void;
  onAdd: () => void;
  onDelete: (idx: number) => void;
}) {
  const personalQuestions = voteQuestions.filter((q) => q.purpose === "personal");

  function findPlayerName(id: string): string {
    return players.find((p) => p.id === id)?.name?.trim() || "(이름 없음)";
  }

  function patchVoteQuestion(questionId: string, patch: Partial<VoteQuestion>) {
    onChangeVoteQuestions(
      voteQuestions.map((q) => (q.id === questionId ? { ...q, ...patch } : q))
    );
  }

  function createPersonalQuestionForCurrentPlayer(): string {
    const newId = crypto.randomUUID();
    const next: VoteQuestion = {
      id: newId,
      voteRound: 1,
      label: "",
      targetMode: "custom-choices",
      purpose: "personal",
      personalTargetPlayerId: currentPlayerId,
      sortOrder: voteQuestions.length,
      choices: [],
    };
    onChangeVoteQuestions([...voteQuestions, next]);
    return newId;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-dark-500">
        승점 조건을 설정하세요. 자동 판정 타입을 지정하면 엔딩 시 달성 여부가 자동으로 표시됩니다.
      </p>

      {scoreConditions.map((sc, idx) => {
        const type = sc.type ?? "manual";
        return (
          <div key={idx} className="rounded-lg border border-dark-700 bg-dark-900/40 p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={sc.description}
                onChange={(e) => onUpdate(idx, { description: e.target.value })}
                placeholder="예: 범인 검거 성공"
                className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
              />
              <input
                type="number"
                value={sc.points}
                onChange={(e) => onUpdate(idx, { points: Number(e.target.value) })}
                className="w-14 bg-dark-800 border border-dark-600 rounded-lg px-2 py-2 text-dark-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
              />
              <span className="text-xs text-dark-500 shrink-0">점</span>
              <button
                type="button"
                onClick={() => onDelete(idx)}
                className="text-dark-500 hover:text-red-400 text-sm px-1 transition-colors"
              >
                삭제
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-dark-500 shrink-0">판정</label>
              <select
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as ScoreConditionType;
                  onUpdate(idx, { type: nextType, config: {} });
                }}
                className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
              >
                {(Object.keys(SCORE_TYPE_LABELS) as ScoreConditionType[]).map((t) => (
                  <option key={t} value={t}>{SCORE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {/* 타입별 config */}
            {type === "culprit-outcome" && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-dark-500 shrink-0">조건</label>
                <select
                  value={sc.config?.expectedOutcome ?? "arrested"}
                  onChange={(e) => onUpdate(idx, {
                    config: { ...sc.config, expectedOutcome: e.target.value as "arrested" | "escaped" },
                  })}
                  className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                >
                  <option value="arrested">범인이 검거됐을 때</option>
                  <option value="escaped">범인이 도주했을 때</option>
                </select>
              </div>
            )}

            {type === "clue-ownership" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-dark-500 shrink-0">대상 단서</label>
                  <select
                    value={sc.config?.clueId ?? ""}
                    onChange={(e) => onUpdate(idx, {
                      config: { ...sc.config, clueId: e.target.value || undefined },
                    })}
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  >
                    <option value="">— 단서 선택 —</option>
                    {clues.map((c) => (
                      <option key={c.id} value={c.id}>{c.title || "(이름 없음)"}</option>
                    ))}
                  </select>
                </div>
                {!sc.config?.clueId && (
                  <p className="text-[11px] text-red-400/80 border border-red-900/40 bg-red-950/10 rounded-lg px-2 py-1.5">
                    대상 단서를 선택해야 엔딩 시 자동 판정이 됩니다. 미선택 시 결과 화면에서 조건 미완성으로 표시됩니다.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-dark-500 shrink-0">조건</label>
                  <select
                    value={sc.config?.expectedOwnership ?? "has"}
                    onChange={(e) => onUpdate(idx, {
                      config: { ...sc.config, expectedOwnership: e.target.value as "has" | "not-has" },
                    })}
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  >
                    <option value="has">보유해야 달성</option>
                    <option value="not-has">미보유해야 달성</option>
                  </select>
                </div>
              </div>
            )}

            {type === "vote-answer" && (() => {
              const linkedQuestion = sc.config?.questionId
                ? personalQuestions.find((pq) => pq.id === sc.config?.questionId)
                : undefined;
              const isOwnedByThisPlayer = linkedQuestion?.personalTargetPlayerId === currentPlayerId;
              const linkedToOther = linkedQuestion && linkedQuestion.personalTargetPlayerId
                && linkedQuestion.personalTargetPlayerId !== currentPlayerId;
              const otherOwnerName = linkedToOther
                ? findPlayerName(linkedQuestion!.personalTargetPlayerId!)
                : null;
              const hasReusableQuestions = personalQuestions.length > 0;

              return (
                <div className="space-y-2 rounded-md border border-purple-900/40 bg-purple-950/10 p-2.5">
                  {!sc.config?.questionId && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const newId = createPersonalQuestionForCurrentPlayer();
                          onUpdate(idx, {
                            config: { ...sc.config, questionId: newId, expectedAnswerId: undefined },
                          });
                        }}
                        className="w-full text-left text-xs px-3 py-2 rounded-md border border-purple-700/60 bg-purple-900/30 text-purple-100 hover:bg-purple-900/50 transition-colors"
                      >
                        + 새 개인 투표 만들기
                      </button>

                      {hasReusableQuestions && (
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-dark-500 shrink-0">기존 연결</label>
                          <select
                            value=""
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next) {
                                onUpdate(idx, {
                                  config: { ...sc.config, questionId: next, expectedAnswerId: undefined },
                                });
                              }
                            }}
                            className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                          >
                            <option value="">— 기존 질문 선택 —</option>
                            {personalQuestions.map((q) => {
                              const ownerLabel = q.personalTargetPlayerId
                                ? `[${findPlayerName(q.personalTargetPlayerId)}]`
                                : "[전원]";
                              return (
                                <option key={q.id} value={q.id}>
                                  {ownerLabel} {q.label || "(질문 없음)"}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {sc.config?.questionId && !linkedQuestion && (
                    <p className="text-[11px] text-red-400/80 border border-red-900/40 bg-red-950/10 rounded-lg px-2 py-1.5">
                      연결된 질문이 삭제됐습니다.
                      <button
                        type="button"
                        onClick={() => onUpdate(idx, { config: {} })}
                        className="ml-1 underline"
                      >
                        연결 해제
                      </button>
                    </p>
                  )}

                  {linkedQuestion && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-purple-300/80">
                          {linkedToOther
                            ? `${otherOwnerName}의 질문에 연결됨`
                            : !isOwnedByThisPlayer
                              ? "전체 플레이어 공통"
                              : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdate(idx, { config: {} })}
                          className="text-[11px] text-dark-500 hover:text-red-400 transition-colors"
                        >
                          연결 해제
                        </button>
                      </div>

                      {linkedToOther && (
                        <p className="text-[11px] text-yellow-400/80 border border-yellow-900/40 bg-yellow-950/10 rounded-lg px-2 py-1.5">
                          정답만 이 캐릭터 기준으로 지정할 수 있습니다. 질문 내용은 {otherOwnerName} 카드에서 편집하세요.
                        </p>
                      )}

                      {!linkedToOther && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[11px] text-dark-500">질문</label>
                            <input
                              type="text"
                              value={linkedQuestion.label}
                              onChange={(e) => patchVoteQuestion(linkedQuestion.id, { label: e.target.value })}
                              placeholder="이 캐릭터에게 던질 개인 질문"
                              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-dark-500 shrink-0">선택지 모드</label>
                            <select
                              value={linkedQuestion.targetMode}
                              onChange={(e) => {
                                const nextMode = e.target.value as VoteQuestion["targetMode"];
                                patchVoteQuestion(linkedQuestion.id, {
                                  targetMode: nextMode,
                                  choices: nextMode === "custom-choices" ? linkedQuestion.choices : [],
                                });
                                onUpdate(idx, { config: { ...sc.config, expectedAnswerId: undefined } });
                              }}
                              className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                            >
                              <option value="custom-choices">직접 작성한 선택지</option>
                              <option value="players-only">플레이어 중에서</option>
                              <option value="players-and-npcs">플레이어 + NPC + 피해자</option>
                            </select>
                          </div>

                          {linkedQuestion.targetMode === "custom-choices" && (
                            <div className="space-y-1.5">
                              <label className="text-[11px] text-dark-500">선택지</label>
                              {linkedQuestion.choices.map((c, ci) => (
                                <div key={c.id} className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={c.label}
                                    onChange={(e) => {
                                      const nextChoices = linkedQuestion.choices.map((x, i) =>
                                        i === ci ? { ...x, label: e.target.value } : x
                                      );
                                      patchVoteQuestion(linkedQuestion.id, { choices: nextChoices });
                                    }}
                                    placeholder={`선택지 ${ci + 1}`}
                                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextChoices = linkedQuestion.choices.filter((_, i) => i !== ci);
                                      patchVoteQuestion(linkedQuestion.id, { choices: nextChoices });
                                      if (sc.config?.expectedAnswerId === c.id) {
                                        onUpdate(idx, { config: { ...sc.config, expectedAnswerId: undefined } });
                                      }
                                    }}
                                    className="text-dark-500 hover:text-red-400 text-xs transition-colors"
                                  >
                                    삭제
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextChoices = [...linkedQuestion.choices, {
                                    id: crypto.randomUUID(),
                                    label: "",
                                  }];
                                  patchVoteQuestion(linkedQuestion.id, { choices: nextChoices });
                                }}
                                className="text-[11px] text-mystery-400 hover:text-mystery-300 transition-colors"
                              >
                                + 선택지 추가
                              </button>
                            </div>
                          )}
                        </>
                      )}

                      {(() => {
                        const answers: { id: string; label: string }[] = linkedQuestion.targetMode === "custom-choices"
                          ? linkedQuestion.choices.map((c) => ({ id: c.id, label: c.label || "(빈 선택지)" }))
                          : linkedQuestion.targetMode === "players-and-npcs"
                            ? buildPlayersNpcsVictimTargets(players, npcs, victim)
                            : players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" }));
                        return (
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-dark-500 shrink-0">정답</label>
                            <select
                              value={sc.config?.expectedAnswerId ?? ""}
                              onChange={(e) => onUpdate(idx, {
                                config: { ...sc.config, expectedAnswerId: e.target.value || undefined },
                              })}
                              className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                            >
                              <option value="">— 정답 선택 —</option>
                              {answers.map((a) => (
                                <option key={a.id} value={a.id}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
      >
        + 승점 조건 추가
      </button>
    </div>
  );
}

// ─── 범인 지정 박스 ─────────────────────────────────────────

/**
 * 범인 지정 셀렉트.
 *
 * 위쪽에 후보군 모드 토글(플레이어만 / 플레이어 + NPC + 피해자)을 두고,
 * 같은 값을 투표 탭의 주 질문 `targetMode` 와 동기화한다.
 * 즉 여기서 모드를 바꾸면 투표 탭의 1차 투표 대상도 같이 갱신되고, 반대도 동일.
 *
 * 이미 NPC/피해자 가 범인으로 저장돼 있으면(레거시 데이터 포함) 모드를 자동으로 확장 모드로 띄운다.
 */
function CulpritSelectorBox({
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

  // 표시용 모드 결정.
  // - 투표 탭 주 질문이 custom-choices 라면 범인 셀렉트는 "플레이어만" 토글이 어색하므로 확장 모드로 전부 노출.
  // - NPC/피해자 가 이미 범인으로 지정돼 있으면 확장 모드로 강제 표시.
  // - 그 외는 주 질문의 targetMode 기준.
  const requiresExpanded = (culpritIdentity && culpritIdentity.kind !== "player") || primaryMode === "custom-choices";
  const effectiveMode: "players-only" | "players-and-npcs" =
    requiresExpanded ? "players-and-npcs"
    : primaryMode === "players-and-npcs" ? "players-and-npcs"
    : "players-only";

  function handleChangeMode(next: "players-only" | "players-and-npcs") {
    if (next === "players-only" && culpritIdentity && culpritIdentity.kind !== "player") {
      // 현재 범인이 NPC/피해자 인데 모드를 좁히면 후보에서 사라지므로 먼저 클리어.
      onChangeCulprit("");
    }
    onChangeCulpritScope(next);
  }

  function handleChangeCulprit(nextId: string) {
    if (!nextId) {
      onChangeCulprit("");
      return;
    }
    // NPC/피해자 를 골랐는데 현재 모드가 좁으면 자동으로 확장 모드로 넓힌다.
    const isNonPlayer = nextId === CULPRIT_VICTIM_ID || npcOptions.some((n) => n.id === nextId);
    if (isNonPlayer && primaryMode !== "players-and-npcs") {
      onChangeCulpritScope("players-and-npcs");
    }
    onChangeCulprit(nextId);
  }

  const showVictimGroup = effectiveMode === "players-and-npcs";
  const showNpcGroup = effectiveMode === "players-and-npcs";

  return (
    <div data-maker-anchor="step-3-culprit" className="rounded-xl border border-dark-700 bg-dark-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-dark-100">범인 지정</p>
          <p className="mt-1 text-xs text-dark-500">
            엔딩 분기·투표 결과 판정에 쓰는 범인입니다.
          </p>
        </div>
      </div>

      {/* 후보군 모드 토글 — 투표 탭 주 질문 targetMode 와 동기화됨. */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-dark-400">범인 후보군 (투표 탭과 동기화)</p>
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
            투표 탭의 주 질문이 "커스텀 선택지" 모드입니다. 범인 후보군은 전체 인물에서 선택할 수 있습니다.
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
          플레이어를 한 명 이상 추가하면 범인을 선택할 수 있습니다.
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
