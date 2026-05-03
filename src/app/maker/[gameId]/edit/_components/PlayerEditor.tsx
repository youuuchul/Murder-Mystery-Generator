"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Button from "@/components/ui/Button";
import ImageAssetField from "./ImageAssetField";
import { useScrollAnchor } from "./useScrollAnchor";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import { optimizeImageForUpload } from "./image-upload-processing";
import {
  buildPlayersNpcsVictimTargets,
  getDisplayedVictoryRole,
  getVictoryConditionInputMode,
  type VictoryConditionInputMode,
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
  UncertainResolution,
  UncertainResolutionTrigger,
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
  /** 캐릭터 카드의 "Step 5로 이동" 버튼 콜백 — 범인 미지정 시 메이커가 빨리 점프할 수 있게. */
  onJumpToCulpritStep: () => void;
  /** 게임 단위 승점 시스템 활성 여부. false면 [승점] 탭 숨김 + 자동 동기화 skip. */
  scoringEnabled: boolean;
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

/**
 * 메이커가 직접 선택할 수 있는 승리조건 모드.
 * `avoid-arrest`/`arrest-culprit`는 culpritPlayerId 1곳을 보면 자동 결정되므로 `auto`로 통합.
 */
const VICTORY_INPUT_OPTIONS: { value: VictoryConditionInputMode; label: string; color: string }[] = [
  { value: "auto", label: "기본", color: "border-mystery-600 bg-mystery-950/30 text-mystery-200" },
  { value: "personal-goal", label: "개인 목표", color: "border-purple-700 bg-purple-950/30 text-purple-300" },
  { value: "uncertain", label: "미확신", color: "border-yellow-700 bg-yellow-950/30 text-yellow-300" },
];

const DERIVED_LABEL: Record<"avoid-arrest" | "arrest-culprit" | "no-culprit", { text: string; color: string }> = {
  "avoid-arrest": { text: "범인 → 검거 회피", color: "text-red-300" },
  "arrest-culprit": { text: "무고 → 범인 검거", color: "text-blue-300" },
  "no-culprit": { text: "범인 미지정", color: "text-yellow-300" },
};

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
    // expectedOutcome 비워둠 — score-evaluator가 displayedRole 기반으로 자동 파생 (auto/uncertain 둘 다 자동 연동).
    scoreConditions: [{
      description: "승리 조건 달성",
      points: 5,
      type: "culprit-outcome",
      autoFromVictory: true,
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
  // 사용/사용안함 토글 시 panel 추가/제거 + 타임라인 영역 펼침/접힘으로 layout shift 큼.
  // hook으로 클릭 element viewport 위치 보존.
  const captureScrollAnchor = useScrollAnchor();

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
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { captureScrollAnchor(e); toggleTimeline(false); }}
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
            onClick={(e) => { captureScrollAnchor(e); toggleTimeline(true); }}
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
          ? `슬롯 ${timeline.slots.length}개`
          : "끄면 플레이어별 행동 입력을 숨깁니다."}
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
        <p className="text-sm text-dark-300 font-medium">타임라인</p>
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
  // 슬롯 추가/삭제 시 panel(이름 비어있는 슬롯 N개) 변동 보존.
  const captureScrollAnchor = useScrollAnchor();

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
        </div>
        <button
          type="button"
          onClick={(e) => { captureScrollAnchor(e); updateSlots([...timeline.slots, createTimelineSlot()]); }}
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
                    onClick={(e) => { captureScrollAnchor(e); updateSlots(timeline.slots.filter((item) => item.id !== slot.id)); }}
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
  story,
  onChange,
  onDelete,
  onJumpToCulpritStep,
  scoringEnabled,
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
  story: Story;
  onChange: (p: Player) => void;
  onDelete: () => void;
  onJumpToCulpritStep: () => void;
  scoringEnabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<"basic" | "score" | "clues" | "rel">("basic");
  // 승점 시스템이 꺼지면 [승점] 탭이 사라지므로 basic으로 fallback. 데이터는 보존, UI만 안전 처리.
  const effectiveTab = !scoringEnabled && tab === "score" ? "basic" : tab;
  const [uploadingImage, setUploadingImage] = useState(false);
  const [storyExpanded, setStoryExpanded] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  // 캐릭터 삭제 시 panel(인원 mismatch / 이름 비어있음) 변동 보존.
  const captureScrollAnchor = useScrollAnchor();

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

  /** 승리조건 자동 연동 점수 항목(autoFromVictory=true). 한 캐릭터당 1개. */
  const autoVictoryScore = player.scoreConditions.find((sc) => sc.autoFromVictory === true);

  function patchAutoVictoryScore(patch: Partial<ScoreCondition>) {
    update(
      "scoreConditions",
      player.scoreConditions.map((sc) => (sc.autoFromVictory === true ? { ...sc, ...patch } : sc)),
    );
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

  // 헤더 배지: 캐릭터 입장(범인/무고/개인 목표/도중 결정) 짧게 표시.
  const inputMode = getVictoryConditionInputMode(player);
  const displayedRole = getDisplayedVictoryRole(player, story);
  const headerBadge = (() => {
    if (inputMode === "personal-goal") return { label: "개인 목표", color: "border-purple-700 bg-purple-950/30 text-purple-300" };
    if (inputMode === "uncertain") return { label: "미확신", color: "border-yellow-700 bg-yellow-950/30 text-yellow-300" };
    if (displayedRole === "avoid-arrest") return { label: "범인", color: "border-red-700 bg-red-950/30 text-red-300" };
    return { label: "무고", color: "border-blue-700 bg-blue-950/30 text-blue-300" };
  })();
  const culpritAssigned = Boolean(story.culpritPlayerId?.trim());
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

  // 게임 단위 승점 시스템 off면 [승점] 탭 자체 숨김. 데이터(player.scoreConditions)는 보존되며 다시 켜면 복원.
  const tabs = [
    { id: "basic" as const, label: "개인 정보" },
    ...(scoringEnabled ? [{ id: "score" as const, label: `승점 (${player.scoreConditions.length})` }] : []),
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
          <span className={`text-xs px-2 py-0.5 rounded-full border ${headerBadge.color} shrink-0`}>
            {headerBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); captureScrollAnchor(e); onDelete(); }}
            className="text-xs text-dark-500 hover:text-red-400 transition-colors px-2 py-1"
          >
            삭제
          </button>
          <span className="text-dark-500 text-sm">{expanded ? "접기" : "열기"}</span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* 좌: 캐릭터 이미지 (큰 사각형) / 우: 이름+배경. 이미지 클릭 시 모달로 크게 보기. */}
          <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-dark-400">캐릭터 이미지</label>
              {(player.cardImage ?? "").trim() ? (
                <button
                  type="button"
                  onClick={() => setImageModalOpen(true)}
                  className="block aspect-square w-full overflow-hidden rounded-xl border border-dark-700 bg-dark-950 transition-colors hover:border-dark-500"
                >
                  <img
                    src={withGameAssetVariant(player.cardImage, "display") ?? player.cardImage}
                    alt={player.name || "캐릭터 이미지"}
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-dark-700 bg-dark-950 text-[11px] text-dark-600">
                  이미지 없음
                </div>
              )}
              <div className="flex gap-1">
                <label
                  htmlFor={`character-image-${player.id}`}
                  className={`flex-1 cursor-pointer rounded-md border border-dark-600 px-2 py-1 text-center text-[11px] text-dark-300 transition-colors hover:border-dark-400 ${uploadingImage ? "opacity-60 pointer-events-none" : ""}`}
                >
                  <input
                    id={`character-image-${player.id}`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const optimized = await optimizeImageForUpload(file, "portrait");
                        await handleCardImageUpload(optimized.file);
                      } catch (error) {
                        console.error("이미지 준비 실패:", error);
                        alert(error instanceof Error ? error.message : "이미지 준비 실패");
                      }
                    }}
                  />
                  {uploadingImage ? "업로드중…" : "업로드"}
                </label>
                {(player.cardImage ?? "").trim() && (
                  <button
                    type="button"
                    onClick={() => update("cardImage", undefined)}
                    className="rounded-md border border-dark-700 px-2 py-1 text-[11px] text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
                  >
                    제거
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-3">
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
                <label className="block text-xs font-medium text-dark-400 mb-1">배경 (전원 공개)</label>
                <textarea
                  rows={5}
                  value={player.background}
                  onChange={(e) => update("background", e.target.value)}
                  placeholder="다른 플레이어에게도 공개되는 캐릭터 소개"
                  className={ta}
                />
              </div>
            </div>
          </div>

          {/* 이미지 크게 보기 모달 — 어디든 클릭 시 닫힘. */}
          {imageModalOpen && (player.cardImage ?? "").trim() && (
            <div
              onClick={() => setImageModalOpen(false)}
              className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
            >
              <img
                src={withGameAssetVariant(player.cardImage, "display") ?? player.cardImage}
                alt={player.name || "캐릭터 이미지"}
                className="pointer-events-none max-h-[90vh] max-w-[90vw] object-contain"
              />
            </div>
          )}

          {/* 승리 조건 — 별도 섹션. 모드별 컬러 톤으로 인식 강조. */}
          {(() => {
            const sectionTone = inputMode === "personal-goal"
              ? "border-purple-700/50 bg-purple-950/15"
              : inputMode === "uncertain"
                ? "border-yellow-700/50 bg-yellow-950/15"
                : "border-mystery-700/50 bg-mystery-950/15";
            return (
          <div className={`rounded-xl border p-4 space-y-3 ${sectionTone}`}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-dark-200">승리 조건</label>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
                {VICTORY_INPUT_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => {
                      // "auto" 선택 → 자동 파생 결과(avoid-arrest / arrest-culprit)를 victoryCondition에 박는다.
                      // 옛 4-enum 데이터 호환성 + 메이커가 명시적으로 "auto"를 골랐다는 의도가 데이터에 담김.
                      // culpritPlayerId 변경 시 동기화는 VoteEndingEditor의 handleChangeCulprit이 담당.
                      //
                      // 승점 자동 연동: "auto" / "uncertain" 모드 둘 다 "승리 조건 달성" culprit-outcome 점수 1개를 [승점] 탭에 자동 유지.
                      // expectedOutcome은 박지 않는다 — score-evaluator가 displayedRole 기반으로 동적 파생한다.
                      // (auto: culpritId 따라 / uncertain: 트리거 결정 따라). 메이커가 삭제했어도 모드 재선택 시 재추가.
                      // 단, 게임 단위 승점 시스템이 꺼져 있으면 자동 보충 skip.
                      const ensureOutcomeScore = (existing: ScoreCondition[]): ScoreCondition[] => {
                        if (!scoringEnabled) return existing;
                        // 승리조건 자동 항목은 한 캐릭터당 1개만. 이미 marker가 박힌 항목이 있으면 skip.
                        const hasAuto = existing.some((sc) => sc.autoFromVictory === true);
                        if (hasAuto) return existing;
                        const auto: ScoreCondition = {
                          description: "승리 조건 달성",
                          points: 5,
                          type: "culprit-outcome",
                          autoFromVictory: true,
                          // expectedOutcome 비워둠 — evaluator가 displayedRole로 자동 파생.
                        };
                        return [auto, ...existing];
                      };

                      if (v.value === "auto") {
                        const expectedRole: VictoryCondition = story.culpritPlayerId === player.id ? "avoid-arrest" : "arrest-culprit";
                        onChange({
                          ...player,
                          victoryCondition: expectedRole,
                          scoreConditions: ensureOutcomeScore(player.scoreConditions),
                        });
                      } else if (v.value === "uncertain") {
                        onChange({
                          ...player,
                          victoryCondition: "uncertain",
                          scoreConditions: ensureOutcomeScore(player.scoreConditions),
                        });
                      } else if (v.value === "personal-goal") {
                        // 개인 목표 모드: personalGoal 텍스트가 description인 manual 점수 1개 자동 보장.
                        // 자동 추가된 항목은 [승점] 탭에서 메이커가 자유 편집 가능 (점수 액수 등).
                        const ensurePersonalGoalScore = (existing: ScoreCondition[]): ScoreCondition[] => {
                          if (!scoringEnabled) return existing;
                          const hasAuto = existing.some((sc) => sc.autoFromVictory === true);
                          if (hasAuto) return existing;
                          const goalText = (player.personalGoal ?? "").trim();
                          const auto: ScoreCondition = {
                            description: goalText || "개인 목표 달성",
                            points: 5,
                            type: "manual",
                            autoFromVictory: true,
                          };
                          return [auto, ...existing];
                        };
                        onChange({
                          ...player,
                          victoryCondition: "personal-goal",
                          scoreConditions: ensurePersonalGoalScore(player.scoreConditions),
                        });
                      } else {
                        update("victoryCondition", v.value);
                      }
                    }}
                    className={[
                      "px-2 py-2 rounded-lg border text-xs font-medium transition-all text-left leading-tight",
                      inputMode === v.value
                        ? v.color
                        : "border-dark-700 text-dark-500 hover:border-dark-500 hover:text-dark-300",
                    ].join(" ")}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {/* "기본" 모드일 때 현재 범인 지정 결과 안내. 큰 라벨 + 보조 한 줄. */}
              {inputMode === "auto" && (() => {
                const role = displayedRole as "avoid-arrest" | "arrest-culprit";
                const tone = !culpritAssigned
                  ? "border-yellow-600/60 bg-yellow-950/25 text-yellow-100"
                  : role === "avoid-arrest"
                    ? "border-red-700/60 bg-red-950/30 text-red-100"
                    : "border-blue-700/60 bg-blue-950/30 text-blue-100";
                const headline = !culpritAssigned ? "범인 미지정" : role === "avoid-arrest" ? "이 캐릭터는 범인" : "이 캐릭터는 무고";
                const sub = !culpritAssigned ? "투표 단계에서 범인을 지정하세요" : role === "avoid-arrest" ? "검거 회피 시 승리" : "범인 검거 시 승리";
                return (
                  <div className={`mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${tone}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight">{headline}</p>
                      <p className="mt-0.5 text-[11px] opacity-75">{sub}</p>
                    </div>
                    {!culpritAssigned && (
                      <button
                        type="button"
                        onClick={onJumpToCulpritStep}
                        className="shrink-0 rounded-md border border-yellow-700/60 bg-yellow-950/40 px-2.5 py-1.5 text-[11px] font-medium text-yellow-100 hover:bg-yellow-900/40 transition-colors"
                      >
                        지정하러 가기
                      </button>
                    )}
                  </div>
                );
              })()}

              {inputMode === "personal-goal" && (
                <div className="mt-2 space-y-3">
                  <input
                    type="text"
                    value={player.personalGoal ?? ""}
                    onChange={(e) => {
                      // personalGoal + 자동 점수 description 동기화를 한 번의 onChange로 처리.
                      // 두 update 콜을 분리하면 첫 콜이 stale player로 덮여 사라진다.
                      const next = e.target.value;
                      const desc = next.trim() || "개인 목표 달성";
                      onChange({
                        ...player,
                        personalGoal: next,
                        scoreConditions: player.scoreConditions.map((sc) =>
                          sc.autoFromVictory === true ? { ...sc, description: desc } : sc,
                        ),
                      });
                    }}
                    placeholder="개인 목표 설명 (예: 유언장 카드 획득)"
                    className={inp}
                  />
                  {/* 판정 방식 — 다른 점수 조건처럼 자동 type 선택. config는 type별 헬퍼로 입력. */}
                  {autoVictoryScore && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-dark-400 shrink-0">판정 방식</label>
                        <select
                          value={autoVictoryScore.type ?? "manual"}
                          onChange={(e) => {
                            const nextType = e.target.value as ScoreConditionType;
                            // type 변경 시 config 초기화 (이전 타입의 config가 stale로 남는 것 방지).
                            patchAutoVictoryScore({ type: nextType, config: undefined });
                          }}
                          className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                        >
                          <option value="manual">수동 판정</option>
                          <option value="target-player-not-arrested">특정 플레이어 미검거</option>
                          <option value="target-player-arrested">특정 플레이어 검거</option>
                          <option value="clue-collection">단서 수집</option>
                        </select>
                      </div>

                      {(autoVictoryScore.type === "target-player-not-arrested"
                        || autoVictoryScore.type === "target-player-arrested") && (
                        <TargetPlayerSelector
                          label="대상"
                          players={players.filter((p) => p.id !== player.id)}
                          value={autoVictoryScore.config?.targetPlayerId ?? ""}
                          onChange={(targetPlayerId) => patchAutoVictoryScore({
                            config: { ...autoVictoryScore.config, targetPlayerId },
                          })}
                          emptyHint="대상 플레이어를 선택하세요."
                        />
                      )}

                      {autoVictoryScore.type === "clue-collection" && (
                        <ClueCollectionInput
                          clues={clues}
                          locations={locations}
                          config={autoVictoryScore.config}
                          points={autoVictoryScore.points}
                          onChange={(patch) => patchAutoVictoryScore({
                            config: { ...autoVictoryScore.config, ...patch },
                          })}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {inputMode === "uncertain" && (
                <UncertainResolutionEditor
                  resolution={player.uncertainResolution}
                  clues={clues}
                  locations={locations}
                  onChange={(next) => update("uncertainResolution", next)}
                />
              )}
              {/* 점수 입력은 [승점] 탭 자동 row에서만 — 승점 시스템 off 시 점수가 의미 없으므로 정보 통일. */}
          </div>
            );
          })()}

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

          {effectiveTab === "basic" && (
            <div className="space-y-3">
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
                <p className="mt-1 text-[11px] text-dark-500">한 줄에 하나씩 적으면 진행 중 확인하기 쉽습니다.</p>
              </div>
            </div>
          )}

          {effectiveTab === "score" && (() => {
            // 자동 연동 항목(autoFromVictory)은 승리조건 영역에서 편집되므로 [승점] 탭에는 read-only row로 노출.
            // 다른 점수 항목과 동일한 row 폼 + 모드 라벨 + 우측 점수 정렬 — 메인 승리조건 인식 + 추가 점수와 시각 통일.
            const visible = player.scoreConditions
              .map((sc, idx) => ({ sc, idx }))
              .filter(({ sc }) => !sc.autoFromVictory);
            // 캐릭터 입장이 확정되면 그에 맞는 라벨로, 아직 미입력/미설정이면 모드 명만 노출.
            // 미확신은 첫 트리거의 resolveAs를 메이커 시점 결과로 보고 그 라벨로 업데이트.
            const modeLabel = (() => {
              if (inputMode === "auto") {
                if (!culpritAssigned) return "기본";
                return displayedRole === "avoid-arrest" ? "검거 회피 시" : "범인 검거 시";
              }
              if (inputMode === "personal-goal") {
                const goal = (player.personalGoal ?? "").trim();
                return goal || "개인 목표";
              }
              // uncertain
              const triggers = player.uncertainResolution?.triggers ?? [];
              if (triggers.length === 0) return "미확신";
              const result = triggers[0]?.resolveAs;
              if (result === "culprit") return "검거 회피 시";
              if (result === "innocent") return "범인 검거 시";
              return "미확신";
            })();
            return (
              <div className="space-y-3">
                {autoVictoryScore && (() => {
                  const isPerClue = (autoVictoryScore.type ?? "manual") === "clue-collection"
                    && autoVictoryScore.config?.clueCountMode === "per-clue";
                  const selectedCount = autoVictoryScore.config?.clueIds?.length ?? 0;
                  const maxPoints = autoVictoryScore.points * selectedCount;
                  return (
                    <div className="rounded-lg border border-mystery-800/60 bg-mystery-950/15 p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <span className="flex-1 px-3 py-2 text-xs text-mystery-200 font-medium">
                          승리 조건 ({modeLabel})
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={autoVictoryScore.points}
                          onChange={(e) => patchAutoVictoryScore({ points: Math.max(0, Number(e.target.value)) })}
                          className="w-14 bg-dark-800 border border-dark-600 rounded-lg px-2 py-2 text-dark-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                        />
                        <span className="text-xs text-dark-500 shrink-0">점</span>
                      </div>
                      {/* per-clue 모드: 메이커 시점 동적 계산 — 단서당 점수 + 선택 개수 + 최대 점수. */}
                      {isPerClue && (
                        <p className="text-[11px] text-mystery-200/90 border-t border-mystery-800/40 pt-2">
                          단서 1개당 <span className="font-semibold">{autoVictoryScore.points}점</span>
                          <span className="text-dark-500"> · </span>
                          선택 <span className="font-semibold">{selectedCount}개</span> 모두 보유 시 최대{" "}
                          <span className="font-semibold">{maxPoints}점</span>
                        </p>
                      )}
                    </div>
                  );
                })()}
                <ScoreConditionsEditor
                  scoreConditions={visible.map((v) => v.sc)}
                  clues={clues}
                  locations={locations}
                  voteQuestions={voteQuestions}
                  onChangeVoteQuestions={onChangeVoteQuestions}
                  currentPlayerId={player.id}
                  players={players}
                  npcs={npcs}
                  victim={victim}
                  onUpdate={(localIdx, patch) => updateScore(visible[localIdx].idx, patch)}
                  onAdd={() => update("scoreConditions", [...player.scoreConditions, { description: "", points: 1, type: "manual" }])}
                  onDelete={(localIdx) => {
                    const realIdx = visible[localIdx].idx;
                    update("scoreConditions", player.scoreConditions.filter((_, i) => i !== realIdx));
                  }}
                />
              </div>
            );
          })()}

          {effectiveTab === "clues" && (
            <div className="space-y-2">
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
                <p className="text-xs text-dark-600 py-2">단서가 없습니다.</p>
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

          {effectiveTab === "rel" && (
            <div className="space-y-2">
              {player.relationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
                  <p className="text-xs text-dark-600">등록된 관계가 없습니다.</p>
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
  onJumpToCulpritStep,
  scoringEnabled,
}: PlayerEditorProps) {
  const [view, setView] = useState<"profiles" | "timeline">("profiles");
  // 캐릭터 추가/삭제로 panel(인원 mismatch / 이름 비어있음) 변동 시 viewport 보존.
  const captureScrollAnchor = useScrollAnchor();
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

  return (
    <div className="space-y-6">
      <div data-maker-anchor="step-3-players" className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-dark-50">플레이어</h2>
          <p className="text-sm text-dark-500 mt-1">
            {players.length}명 등록
            {" · "}
            {timeline.enabled
              ? `타임라인 슬롯 ${timeline.slots.length}개`
              : "타임라인 꺼짐"}
          </p>
        </div>
        <Button size="sm" onClick={(e) => { captureScrollAnchor(e); onChange([...players, createPlayer()]); }}>+ 플레이어 추가</Button>
      </div>

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
          타임라인
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
            onClick={(e) => { captureScrollAnchor(e); onChange([...players, createPlayer()]); }}
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
              story={story}
              onChange={(updated) => onChange(players.map((p, i) => i === idx ? updated : p))}
              onDelete={() => onChange(players.filter((_, i) => i !== idx))}
              onJumpToCulpritStep={onJumpToCulpritStep}
              scoringEnabled={scoringEnabled}
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
  "vote-answer": "개인 투표 답변",
  "target-player-not-arrested": "특정 플레이어 미검거",
  "target-player-arrested": "특정 플레이어 검거",
  "clue-collection": "단서 수집",
};

function ScoreConditionsEditor({
  scoreConditions,
  clues,
  locations,
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
  locations: Location[];
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
                          질문은 {otherOwnerName} 카드에서 편집합니다.
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

            {/* 신규 — 케이스 A: 특정 플레이어 미검거 */}
            {type === "target-player-not-arrested" && (
              <TargetPlayerSelector
                label="이 플레이어가 검거되지 않으면"
                players={players}
                value={sc.config?.targetPlayerId ?? ""}
                onChange={(targetPlayerId) => onUpdate(idx, { config: { ...sc.config, targetPlayerId } })}
                emptyHint="대상 플레이어를 선택해야 자동 판정됩니다."
              />
            )}

            {/* 신규 — 케이스 C: 특정 플레이어 검거 (범인 유무 무관) */}
            {type === "target-player-arrested" && (
              <TargetPlayerSelector
                label="이 플레이어가 검거되면 (범인 유무 무관)"
                players={players}
                value={sc.config?.targetPlayerId ?? ""}
                onChange={(targetPlayerId) => onUpdate(idx, { config: { ...sc.config, targetPlayerId } })}
                emptyHint="대상 플레이어를 선택해야 자동 판정됩니다."
              />
            )}

            {/* 신규 — 케이스 D: 단서 N개 수집 */}
            {type === "clue-collection" && (
              <ClueCollectionInput
                clues={clues}
                locations={locations}
                config={sc.config}
                points={sc.points}
                onChange={(next) => onUpdate(idx, { config: { ...sc.config, ...next } })}
              />
            )}
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

// ─── 승점 조건 type별 부가 입력 헬퍼 ─────────────────────────

function TargetPlayerSelector({
  label,
  players,
  value,
  onChange,
  emptyHint,
}: {
  label: string;
  players: Player[];
  value: string;
  onChange: (targetPlayerId: string | undefined) => void;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-dark-500 shrink-0">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
        >
          <option value="">— 플레이어 선택 —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name || "(이름 없음)"}</option>
          ))}
        </select>
      </div>
      {!value && emptyHint && (
        <p className="text-[11px] text-red-400/80 border border-red-900/40 bg-red-950/10 rounded-lg px-2 py-1.5">
          {emptyHint}
        </p>
      )}
    </div>
  );
}

/** 단서를 소속 장소별로 그룹핑한다. 장소 미지정 단서는 마지막에 묶음. */
function groupCluesByLocation(clues: Clue[], locations: Location[]): { locationName: string; clues: Clue[] }[] {
  const byLoc = new Map<string, Clue[]>();
  const orphan: Clue[] = [];
  for (const clue of clues) {
    const locId = clue.locationId;
    if (!locId) { orphan.push(clue); continue; }
    if (!byLoc.has(locId)) byLoc.set(locId, []);
    byLoc.get(locId)!.push(clue);
  }
  const groups: { locationName: string; clues: Clue[] }[] = [];
  for (const loc of locations) {
    const arr = byLoc.get(loc.id);
    if (arr && arr.length > 0) groups.push({ locationName: loc.name?.trim() || "(이름 없는 장소)", clues: arr });
  }
  if (orphan.length > 0) groups.push({ locationName: "(장소 미지정)", clues: orphan });
  return groups;
}

function ClueCollectionInput({
  clues,
  locations,
  config,
  points,
  onChange,
}: {
  clues: Clue[];
  locations: Location[];
  config: ScoreCondition["config"];
  /** 단위 점수 (개당). per-clue 모드의 총점 동적 계산에 사용. 0 이하면 per-clue 옵션 비활성. */
  points: number;
  onChange: (patch: Partial<NonNullable<ScoreCondition["config"]>>) => void;
}) {
  const selectedIds = config?.clueIds ?? [];
  const mode = config?.clueCountMode ?? "all";
  const threshold = config?.clueCountThreshold ?? 1;
  const groups = groupCluesByLocation(clues, locations);
  const perClueAllowed = points > 0;

  function toggleClue(clueId: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...selectedIds, clueId]))
      : selectedIds.filter((id) => id !== clueId);
    onChange({ clueIds: next });
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[11px] text-dark-500 mb-1 block">대상 단서 (다중 선택)</label>
        {clues.length === 0 ? (
          <p className="text-[11px] text-dark-600 border border-dashed border-dark-700 rounded-lg px-2 py-1.5">
            등록된 단서가 없습니다.
          </p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-dark-700 bg-dark-950/40 p-2">
            {groups.map((g) => (
              <div key={g.locationName}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-500 mb-1 px-1">
                  {g.locationName}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {g.clues.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-[11px] text-dark-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={(e) => toggleClue(c.id, e.target.checked)}
                        className="shrink-0"
                      />
                      <span className="truncate">{c.title || "(이름 없음)"}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={`mt-1 text-[11px] rounded-lg px-2 py-1.5 ${selectedIds.length === 0
          ? "text-red-400/80 border border-red-900/40 bg-red-950/10"
          : "text-dark-400 border border-dark-700 bg-dark-950/40"}`}>
          {selectedIds.length === 0
            ? "대상 단서를 1개 이상 선택해야 자동 판정됩니다."
            : `선택 ${selectedIds.length}개`}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[11px] text-dark-500 shrink-0">조건</label>
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as "all" | "at-least-n" | "per-clue";
            // per-clue는 단위 점수가 있어야 의미 있음. 점수 0이면 per-clue 선택해도 다시 all로 되돌림.
            if (next === "per-clue" && !perClueAllowed) {
              onChange({ clueCountMode: "all" });
              return;
            }
            onChange({ clueCountMode: next });
          }}
          className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
        >
          <option value="all">선택한 단서 모두 보유 시</option>
          <option value="at-least-n">N개 이상 보유 시</option>
          <option value="per-clue" disabled={!perClueAllowed}>
            {perClueAllowed ? "보유 단서 1개당 (누적)" : "보유 단서 1개당 — 아래 점수 설정 필요"}
          </option>
        </select>
      </div>

      {mode === "at-least-n" && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-dark-500 shrink-0">최소 N</label>
          <input
            type="number"
            min={1}
            max={selectedIds.length || 1}
            value={threshold}
            onChange={(e) => onChange({ clueCountThreshold: Math.max(1, Number(e.target.value)) })}
            className="w-16 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
          />
          <span className="text-[11px] text-dark-500">/ {selectedIds.length}개 중</span>
        </div>
      )}

      {/* per-clue 동적 계산은 [승점] 탭 자동 row에 표시 — 개인 목표 영역에 점수 정보가 흩어지지 않도록. */}
    </div>
  );
}

// ─── 미확신 캐릭터 결정 트리거 입력 ─────────────────────────

/**
 * 미확신(uncertain) 캐릭터의 도중 결정 트리거 편집기.
 *
 * triggers 하위에서 종류·조건·결정·메시지를 모두 편집한다. 추가 버튼은 1개 — 트리거 1개부터 시작.
 * triggerMatch는 트리거 2개 이상일 때만 노출되며 "any"(어느 하나) / "all"(모두) 중 선택.
 * 단서 트리거 라벨이 "단서 확인/보유"인 이유: 본인이 인벤토리로 보유 OR 공용 단서 카드를 직접 확인(모달 열람)한 시점에 발동.
 *
 * 발동 시 본인 카드에 toast 알림이 뜨며, message 입력 시 그 값, 없으면 시스템 기본 문구.
 * defaultResolveAs는 어떤 트리거도 발동 안 한 채 게임 종료 시 적용. 비워두면 "미결정" 라벨 유지.
 */
function UncertainResolutionEditor({
  resolution,
  clues,
  locations,
  onChange,
}: {
  resolution: UncertainResolution | undefined;
  clues: Clue[];
  locations: Location[];
  onChange: (next: UncertainResolution | undefined) => void;
}) {
  const triggers = resolution?.triggers ?? [];
  const clueGroups = groupCluesByLocation(clues, locations);
  const triggerMatch = resolution?.triggerMatch ?? "any";
  const defaultResolveAs = resolution?.defaultResolveAs;
  const captureAnchor = useScrollAnchor();
  // 삭제 시 클릭 element가 detach되어 보정이 망가지는 것을 막기 위해 컨테이너를 stable anchor로 사용.
  const containerRef = useRef<HTMLDivElement>(null);

  function commit(next: {
    triggers?: UncertainResolutionTrigger[];
    triggerMatch?: "any" | "all";
    defaultResolveAs?: "culprit" | "innocent";
  }) {
    const nextTriggers = next.triggers ?? triggers;
    const nextMatch = next.triggerMatch ?? triggerMatch;
    const nextDefault = "defaultResolveAs" in next ? next.defaultResolveAs : defaultResolveAs;
    if (nextTriggers.length === 0 && nextDefault === undefined) {
      onChange(undefined);
      return;
    }
    onChange({ triggers: nextTriggers, triggerMatch: nextMatch, defaultResolveAs: nextDefault });
  }

  function addTrigger() {
    // 신규 트리거는 기존 트리거의 resolveAs를 이어받아 매칭 박스의 단일 결정과 정합 유지.
    const carryResolveAs = triggers[0]?.resolveAs ?? "innocent";
    const newTrigger: UncertainResolutionTrigger = { kind: "round-reached", round: 1, resolveAs: carryResolveAs };
    commit({ triggers: [...triggers, newTrigger] });
  }

  /** 매칭 박스의 단일 "결정"이 변경되면 모든 트리거의 resolveAs를 일괄 동기화한다. */
  function setCommonResolveAs(value: "culprit" | "innocent") {
    const next = triggers.map((t) => ({ ...t, resolveAs: value }) as UncertainResolutionTrigger);
    commit({ triggers: next });
  }

  function updateTrigger(idx: number, patch: Partial<UncertainResolutionTrigger>) {
    const next = triggers.map((t, i) => (i === idx ? ({ ...t, ...patch } as UncertainResolutionTrigger) : t));
    commit({ triggers: next });
  }

  function changeKind(idx: number, nextKind: "round-reached" | "clue-seen") {
    const current = triggers[idx];
    if (current.kind === nextKind) return;
    const carry = { resolveAs: current.resolveAs, message: current.message };
    const nextTrigger: UncertainResolutionTrigger =
      nextKind === "round-reached"
        ? { kind: "round-reached", round: 1, ...carry }
        : { kind: "clue-seen", clueId: "", ...carry };
    commit({ triggers: triggers.map((t, i) => (i === idx ? nextTrigger : t)) });
  }

  function removeTrigger(idx: number) {
    commit({ triggers: triggers.filter((_, i) => i !== idx) });
  }

  // 트리거 설정 요약 — 위 안내 박스에 동적 표시. 트리거 카드와 중복되지 않도록 결과 한 줄.
  const summaryText = (() => {
    if (triggers.length === 0) return "트리거 미설정 — 게임 동안 미결정 유지";
    const result = triggers[0]?.resolveAs === "culprit" ? "범인" : "무고";
    if (triggers.length === 1) return `조건 만족 시 → ${result}`;
    const matchLabel = triggerMatch === "all" ? "모든" : "어느 한";
    return `${matchLabel} 트리거 만족 시 → ${result}`;
  })();

  return (
    <div ref={containerRef} className="mt-2 space-y-2 rounded-lg border border-yellow-900/40 bg-yellow-950/10 p-2">
      <p className="text-[11px] font-medium text-yellow-200">{summaryText}</p>

      <div className="space-y-1.5">
        {triggers.length === 0 ? null : (
          triggers.map((trigger, idx) => (
            <div key={idx} className="rounded-lg border border-dark-700 bg-dark-900/40 p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <select
                  value={trigger.kind}
                  onChange={(e) => changeKind(idx, e.target.value as "round-reached" | "clue-seen")}
                  className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                >
                  <option value="round-reached">특정 라운드 진입 시</option>
                  <option value="clue-seen">특정 단서 확인/보유 시</option>
                </select>
                <button
                  type="button"
                  onClick={() => { captureAnchor(containerRef.current); removeTrigger(idx); }}
                  className="px-2 py-1 text-[11px] text-red-400/80 hover:text-red-300"
                >
                  삭제
                </button>
              </div>

              {trigger.kind === "round-reached" && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-dark-500 shrink-0">라운드</label>
                  <input
                    type="number"
                    min={1}
                    value={trigger.round}
                    onChange={(e) => updateTrigger(idx, { round: Math.max(1, Number(e.target.value)) })}
                    className="w-16 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  />
                  <span className="text-[11px] text-dark-500">진입 시</span>
                </div>
              )}

              {trigger.kind === "clue-seen" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-dark-500 shrink-0">단서</label>
                    <select
                      value={trigger.clueId}
                      onChange={(e) => updateTrigger(idx, { clueId: e.target.value })}
                      className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                    >
                      <option value="">— 단서 선택 —</option>
                      {clueGroups.map((g) => (
                        <optgroup key={g.locationName} label={g.locationName}>
                          {g.clues.map((c) => (
                            <option key={c.id} value={c.id}>{c.title || "(이름 없음)"}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {!trigger.clueId && (
                    <p className="text-[11px] text-red-400/80 border border-red-900/40 bg-red-950/10 rounded-lg px-2 py-1.5">
                      단서를 선택해야 트리거가 동작합니다.
                    </p>
                  )}
                </div>
              )}

              {/* 결정 셀렉트는 트리거 1개일 때만 트리거 카드 안에 표시. 2개 이상이면 매칭 박스의 통합 결정이 적용. */}
              {triggers.length === 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-dark-500 shrink-0">결정</label>
                  <select
                    value={trigger.resolveAs}
                    onChange={(e) => updateTrigger(idx, { resolveAs: e.target.value as "culprit" | "innocent" })}
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  >
                    <option value="innocent">무고로 결정</option>
                    <option value="culprit">범인으로 결정</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] text-dark-500 mb-1 block">알림 메시지 (선택)</label>
                <input
                  type="text"
                  value={trigger.message ?? ""}
                  onChange={(e) => updateTrigger(idx, { message: e.target.value || undefined })}
                  placeholder={trigger.resolveAs === "culprit" ? "예: 당신이 범인이었습니다." : "예: 당신은 무고합니다."}
                  className="w-full bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                />
                <p className="mt-1 text-[10px] text-dark-600">
                  비워두면 시스템 기본 문구로 표시됩니다.
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={(e) => { captureAnchor(e); addTrigger(); }}
        className="w-full py-1.5 px-2 rounded-md border border-dashed border-dark-600 hover:border-yellow-500 text-dark-400 hover:text-yellow-300 text-[11px] font-medium transition-colors"
      >
        + 트리거 추가
      </button>

      {/* 매칭 모드 + 통합 결정 — 트리거 2개 이상일 때 노출. 결정은 모든 트리거에 일괄 동기화되어 중복 제거. */}
      {triggers.length >= 2 && (
        <div className="space-y-1.5 rounded-lg border border-amber-700/60 bg-amber-950/30 px-2 py-2">
          <div className="flex items-center gap-2">
            <label className="w-10 shrink-0 text-[11px] font-semibold text-amber-200">매칭</label>
            <select
              value={triggerMatch}
              onChange={(e) => commit({ triggerMatch: e.target.value === "all" ? "all" : "any" })}
              className="flex-1 bg-dark-800 border border-amber-700/40 rounded-lg px-2 py-1 text-amber-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            >
              <option value="any">어느 한 트리거라도 만족 시 (OR)</option>
              <option value="all">모든 트리거 동시 만족 시 (AND)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-10 shrink-0 text-[11px] font-semibold text-amber-200">결정</label>
            <select
              value={triggers[0]?.resolveAs ?? "innocent"}
              onChange={(e) => setCommonResolveAs(e.target.value as "culprit" | "innocent")}
              className="flex-1 bg-dark-800 border border-amber-700/40 rounded-lg px-2 py-1 text-amber-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
            >
              <option value="innocent">무고로 결정</option>
              <option value="culprit">범인으로 결정</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1.5 border-t border-dark-700/60">
        <label className="text-[11px] text-dark-500 shrink-0">미발동 시</label>
        <select
          value={defaultResolveAs ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const next = v === "culprit" || v === "innocent" ? v : undefined;
            commit({ defaultResolveAs: next });
          }}
          className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-2 py-1.5 text-dark-100 text-xs focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
        >
          <option value="">미결정 유지</option>
          <option value="innocent">무고로 결정</option>
          <option value="culprit">범인으로 결정</option>
        </select>
      </div>
    </div>
  );
}

// 범인 지정 박스(`CulpritSelectorBox`)는 `./CulpritSelectorBox.tsx`로 분리됨.
// Step 5(VoteEndingEditor) 상단에서 사용된다.
