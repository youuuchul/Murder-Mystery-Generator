"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type {
  Player,
  Clue,
  Story,
  VictoryCondition,
  ScoreCondition,
  RelatedClueRef,
  Relationship,
  StoryTimeline,
} from "@/types/game";

interface PlayerEditorProps {
  players: Player[];
  clues: Clue[];
  story: Story;
  timeline: StoryTimeline;
  onChange: (players: Player[]) => void;
  onSave: () => void;
  saving: boolean;
}

interface RelationTargetOption {
  value: string;
  label: string;
}

const VICTORY_OPTIONS: { value: VictoryCondition; label: string; desc: string; color: string }[] = [
  { value: "avoid-arrest", label: "검거 회피", desc: "범인 — 끝까지 들키지 마세요", color: "border-red-700 bg-red-950/30 text-red-300" },
  { value: "uncertain", label: "검거 or 회피", desc: "미확정 — 스스로도 확신할 수 없습니다", color: "border-yellow-700 bg-yellow-950/30 text-yellow-300" },
  { value: "arrest-culprit", label: "범인 검거", desc: "무고 — 진범을 찾아내세요", color: "border-blue-700 bg-blue-950/30 text-blue-300" },
  { value: "personal-goal", label: "개인 목표", desc: "별도 목표 달성이 우선", color: "border-purple-700 bg-purple-950/30 text-purple-300" },
];

const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";
const ta = inp + " resize-none";

/** 메이커 편집기에서 새 캐릭터를 추가할 때 사용하는 기본 템플릿이다. */
function createPlayer(): Player {
  return {
    id: crypto.randomUUID(),
    name: "",
    victoryCondition: "arrest-culprit",
    personalGoal: "",
    scoreConditions: [{ description: "범인 검거 성공", points: 3 }],
    background: "",
    story: "",
    secret: "",
    timelineEntries: [],
    relatedClues: [],
    relationships: [],
  };
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
      };
    }),
  };
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

  if (!timeline.enabled) {
    return (
      <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl">
        <p className="text-dark-500 text-sm">타임라인 사용이 꺼져 있습니다.</p>
        <p className="text-xs text-dark-600 mt-1">Step 2에서 시간대 슬롯을 먼저 켜고 정의하세요.</p>
      </div>
    );
  }

  if (timeline.slots.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-dark-700 rounded-xl">
        <p className="text-dark-500 text-sm">아직 정의된 시간대 슬롯이 없습니다.</p>
        <p className="text-xs text-dark-600 mt-1">Step 2에서 슬롯을 추가하면 여기서 캐릭터별 행동을 한 번에 입력할 수 있습니다.</p>
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
        <p className="text-sm text-dark-300 font-medium">중앙 타임라인 편집</p>
        <p className="text-xs text-dark-500 mt-1">
          시간대별로 모든 캐릭터 행동을 모아 입력합니다. 서로의 위치와 행동을 비교하면서 모순을 줄이기 위한 입력 화면입니다.
        </p>
      </div>

      {timeline.slots.map((slot) => (
        <section key={slot.id} className="border border-dark-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-mystery-300">{slot.label || "이름 없는 슬롯"}</p>
              <p className="text-xs text-dark-500 mt-1">이 시간대의 행동과 위치를 각 캐릭터별로 정리합니다.</p>
            </div>
            <span className="text-xs text-dark-600 shrink-0">{players.length}명</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {players.map((player) => {
              const entry = player.timelineEntries.find((item) => item.slotId === slot.id);

              return (
                <div key={player.id} className="border border-dark-800 bg-dark-900/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-dark-100">{player.name || "이름 없는 캐릭터"}</p>
                    <span className="text-[11px] text-dark-600 shrink-0">
                      {(entry?.action ?? "").trim().length > 0 ? "입력됨" : "미입력"}
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={entry?.action ?? ""}
                    onChange={(e) => updateTimelineAction(player.id, slot.id, e.target.value)}
                    placeholder="예: 서재에서 유언장을 찾다가 복도로 이동했다."
                    className={ta}
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

function PlayerForm({
  player,
  clues,
  relationTargets,
  onChange,
  onDelete,
}: {
  player: Player;
  clues: Clue[];
  relationTargets: RelationTargetOption[];
  onChange: (p: Player) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<"basic" | "score" | "clues" | "rel">("basic");

  function update<K extends keyof Player>(key: K, value: Player[K]) {
    onChange({ ...player, [key]: value });
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
    update("relationships", [
      ...player.relationships,
      { targetType: "player", targetId: "", playerId: "", description: "" },
    ]);
  }

  const conditionInfo = VICTORY_OPTIONS.find((v) => v.value === player.victoryCondition);
  const filteredRelationTargets = relationTargets.filter((target) => target.value !== `player:${player.id}`);

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
                <label className="block text-xs font-medium text-dark-400 mb-1">
                  상세 스토리 <span className="text-mystery-500">(본인만 열람)</span>
                </label>
                <textarea
                  rows={5}
                  value={player.story}
                  onChange={(e) => update("story", e.target.value)}
                  placeholder="이 캐릭터가 알고 있는 사건 전후 맥락, 감정선, 의심하는 대상, 숨기고 싶은 사정을 자세히 적으세요."
                  className={ta}
                />
                <p className="mt-1 text-[11px] text-dark-500">
                  시간대별 행동과 알리바이는 위쪽 중앙 타임라인 탭에서 따로 입력합니다.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1">
                  비밀 / 반전 정보 <span className="text-mystery-500">(본인만 열람)</span>
                </label>
                <textarea
                  rows={4}
                  value={player.secret}
                  onChange={(e) => update("secret", e.target.value)}
                  placeholder="후반 공개용 비밀, 숨긴 행동, 진범 여부와 연결되는 핵심 정보를 적으세요."
                  className={ta}
                />
              </div>
            </div>
          )}

          {tab === "score" && (
            <div className="space-y-2">
              <p className="text-xs text-dark-500">이 캐릭터의 승점 조건을 설정하세요.</p>
              {player.scoreConditions.map((sc, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={sc.description}
                    onChange={(e) => updateScore(idx, { description: e.target.value })}
                    placeholder="예: 범인 검거 성공"
                    className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  />
                  <input
                    type="number"
                    value={sc.points}
                    onChange={(e) => updateScore(idx, { points: Number(e.target.value) })}
                    className="w-14 bg-dark-800 border border-dark-600 rounded-lg px-2 py-2 text-dark-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-mystery-500 transition"
                  />
                  <span className="text-xs text-dark-500 shrink-0">점</span>
                  <button
                    type="button"
                    onClick={() => update("scoreConditions", player.scoreConditions.filter((_, i) => i !== idx))}
                    className="text-dark-500 hover:text-red-400 text-sm px-1 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => update("scoreConditions", [...player.scoreConditions, { description: "", points: 1 }])}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
              >
                + 승점 조건 추가
              </button>
            </div>
          )}

          {tab === "clues" && (
            <div className="space-y-2">
              <p className="text-xs text-dark-500">
                이 캐릭터와 관련된 단서를 선택하고 설명을 작성하세요. 게임 시작 시 본인에게 공개됩니다.
              </p>
              {player.relatedClues.map((rc, idx) => (
                <div key={idx} className="border border-dark-700/60 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={rc.clueId}
                      onChange={(e) => updateRelatedClue(idx, { clueId: e.target.value })}
                      className="flex-1 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-dark-200 text-xs focus:outline-none focus:ring-1 focus:ring-mystery-500"
                    >
                      <option value="">— 단서 선택 —</option>
                      {clues.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title || "(제목 없음)"} [{c.type}]
                        </option>
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
              ))}
              {clues.length === 0 ? (
                <p className="text-xs text-dark-600 py-2">Step 4(장소 & 단서)에서 단서를 먼저 추가하세요.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => update("relatedClues", [...player.relatedClues, { clueId: "", note: "" }])}
                  className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                >
                  + 연관 단서 추가
                </button>
              )}
            </div>
          )}

          {tab === "rel" && (
            <div className="space-y-2">
              {player.relationships.map((rel, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    value={
                      rel.targetType && rel.targetId
                        ? `${rel.targetType}:${rel.targetId}`
                        : rel.playerId
                          ? `player:${rel.playerId}`
                          : ""
                    }
                    onChange={(e) => {
                      const [targetType, targetId] = e.target.value.split(":");
                      updateRel(idx, {
                        targetType: (targetType as Relationship["targetType"]) || "player",
                        targetId: targetId ?? "",
                        playerId: targetType === "player" ? targetId ?? "" : undefined,
                      });
                    }}
                    className="w-44 bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-dark-200 text-xs focus:outline-none focus:ring-1 focus:ring-mystery-500"
                  >
                    <option value="">대상 선택</option>
                    {filteredRelationTargets.map((target) => (
                      <option key={target.value} value={target.value}>{target.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rel.description}
                    onChange={(e) => updateRel(idx, { description: e.target.value })}
                    placeholder="관계 설명"
                    className="flex-1 bg-dark-800 border border-dark-600 rounded px-2 py-1.5 text-dark-100 text-xs placeholder:text-dark-600 focus:outline-none focus:ring-1 focus:ring-mystery-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => update("relationships", player.relationships.filter((_, i) => i !== idx))}
                    className="text-dark-500 hover:text-red-400 text-sm px-1 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRelationship}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
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

export default function PlayerEditor({ players, clues, story, timeline, onChange, onSave, saving }: PlayerEditorProps) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-dark-50">플레이어</h2>
          <p className="text-sm text-dark-500 mt-1">
            {players.length}명 등록 · 피해자는 사건 개요 탭에서 작성합니다.
          </p>
          {timeline.enabled && (
            <p className="text-xs text-dark-600 mt-1">
              행동 타임라인 사용 중 · 시간대 슬롯 {timeline.slots.length}개
            </p>
          )}
        </div>
        <Button size="sm" onClick={() => onChange([...players, createPlayer()])}>+ 플레이어 추가</Button>
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
        {timeline.enabled && (
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
        )}
      </div>

      {view === "timeline" && timeline.enabled ? (
        <TimelineMatrixEditor
          players={syncedPlayers}
          timeline={timeline}
          onChange={onChange}
        />
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
              player={player}
              clues={clues}
              relationTargets={relationTargets}
              onChange={(updated) => onChange(players.map((p, i) => i === idx ? updated : p))}
              onDelete={() => onChange(players.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">저장</Button>
      </div>
    </div>
  );
}
