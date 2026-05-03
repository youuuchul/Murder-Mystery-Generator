"use client";

import { useState, useEffect } from "react";
import CulpritSelectorBox from "./CulpritSelectorBox";
import EndingEditor from "./EndingEditor";
import { useScrollAnchor } from "./useScrollAnchor";
import { buildPlayersNpcsVictimTargets, isCulpritIdValid, getVictoryConditionInputMode } from "@/lib/culprit";
import type {
  EndingConfig,
  GamePackage,
  Player,
  ScriptSegment,
  Story,
  StoryNpc,
  VoteQuestion,
  VoteQuestionChoice,
  VoteTargetMode,
} from "@/types/game";

type Tab = "vote" | "ending" | "personal" | "author";

const inp =
  "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

const TARGET_MODE_LABELS: Record<VoteTargetMode, string> = {
  "players-only": "플레이어만",
  "players-and-npcs": "플레이어 + NPC + 피해자",
  "custom-choices": "커스텀 선택지",
};

function createVoteQuestion(voteRound: number, purpose: "ending" | "personal" = "ending"): VoteQuestion {
  return {
    id: crypto.randomUUID(),
    voteRound,
    label: "",
    targetMode: "players-only",
    purpose,
    sortOrder: 0,
    choices: [],
  };
}

function createVoteChoice(): VoteQuestionChoice {
  return { id: crypto.randomUUID(), label: "" };
}

/**
 * 투표 자동 선택지 생성.
 * `players-and-npcs` 는 "플레이어 + NPC + 피해자(이름 있을 때)" 묶음.
 */
function buildAutoTargets(
  targetMode: VoteTargetMode,
  players: Player[],
  npcs: StoryNpc[],
  victim: Story["victim"] | undefined,
): { id: string; label: string }[] {
  if (targetMode === "players-only") {
    return players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" }));
  }
  if (targetMode === "players-and-npcs") {
    return buildPlayersNpcsVictimTargets(players, npcs, victim);
  }
  return [];
}

/** 질문의 실제 선택지 목록 (커스텀이면 choices, 아니면 자동 생성) */
function getEffectiveChoices(
  q: VoteQuestion,
  players: Player[],
  npcs: StoryNpc[],
  victim: Story["victim"] | undefined,
): { id: string; label: string }[] {
  if (q.targetMode === "custom-choices") return q.choices;
  return buildAutoTargets(q.targetMode, players, npcs, victim);
}

// ─── VoteQuestionForm ─────────────────────────────────────

function VoteQuestionForm({
  question,
  isSecondRound,
  firstRoundQuestion,
  players,
  npcs,
  victim,
  onChange,
  onDelete,
  onChangeChoices,
}: {
  question: VoteQuestion;
  isSecondRound?: boolean;
  firstRoundQuestion?: VoteQuestion;
  players: Player[];
  npcs: StoryNpc[];
  victim: Story["victim"] | undefined;
  onChange: (patch: Partial<VoteQuestion>) => void;
  onDelete: () => void;
  onChangeChoices: (c: VoteQuestionChoice[]) => void;
}) {
  const [expanded, setExpanded] = useState(!question.label);
  const firstRoundChoices = firstRoundQuestion
    ? getEffectiveChoices(firstRoundQuestion, players, npcs, victim)
    : [];

  return (
    <div className="rounded-xl border border-dark-700/70 bg-dark-950/45 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-3 text-left transition-colors hover:bg-dark-900/50"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400">
                {TARGET_MODE_LABELS[question.targetMode]}
              </span>
              {question.purpose === "personal" && (
                <span className="rounded-full border border-purple-800 bg-purple-950/30 px-2 py-0.5 text-[11px] text-purple-200">
                  {players.find((p) => p.id === question.personalTargetPlayerId)?.name?.trim() || "대상 미지정"}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-medium text-dark-100">
              {question.label || <span className="text-dark-500 italic">질문 텍스트 없음</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded-lg border border-dark-700 px-2.5 py-1.5 text-xs text-dark-500 hover:border-red-900/50 hover:text-red-400 transition-colors"
            >
              삭제
            </button>
            <span className="text-xs text-dark-500">{expanded ? "접기" : "열기"}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-dark-800/80 bg-black/10 px-3 pb-3 pt-3">

          {/* 2차 투표: 트리거 조건 (맨 위) */}
          {isSecondRound && firstRoundQuestion && (
            <div className="space-y-3 rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-3">
              <p className="text-xs font-medium text-yellow-300/80">2차 투표 발동 조건</p>
              <div>
                <label className="block text-xs text-dark-500 mb-1">1차 투표에서 어떤 결과일 때 2차 투표를 시작할까요?</label>
                <select
                  value={question.triggerCondition?.resultEquals ?? ""}
                  onChange={(e) => {
                    const choiceId = e.target.value;
                    onChange({
                      triggerCondition: choiceId
                        ? { requiresVoteRound: 1, questionId: firstRoundQuestion.id, resultEquals: choiceId }
                        : undefined,
                    });
                  }}
                  className={inp}
                >
                  <option value="">-- 1차 투표 선택지 선택 --</option>
                  {firstRoundChoices.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 2차 투표: 스토리 텍스트 (트리거 다음) */}
          {isSecondRound && (
            <div>
              <label className="block text-xs text-dark-500 mb-1">2차 투표 전 스토리 텍스트</label>
              <textarea
                rows={4}
                value={question.preStoryText ?? ""}
                onChange={(e) => onChange({ preStoryText: e.target.value || undefined })}
                placeholder="1차 투표 결과 공개 후, 2차 투표 전에 보여줄 추가 스토리"
                className={inp + " resize-none"}
              />
            </div>
          )}

          {/* 질문 텍스트 */}
          <div>
            <label className="block text-xs text-dark-500 mb-1">질문 텍스트</label>
            <input
              type="text"
              value={question.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="예: 범인은 누구인가?"
              className={inp}
            />
          </div>

          {/* 개인 목표 투표 대상 플레이어 */}
          {question.purpose === "personal" && (
            <div>
              <label className="block text-xs text-dark-500 mb-1">이 개인 투표를 받을 플레이어</label>
              <select
                value={question.personalTargetPlayerId ?? ""}
                onChange={(e) => onChange({ personalTargetPlayerId: e.target.value || undefined })}
                className={inp}
              >
                <option value="">-- 플레이어 선택 (미지정 시 전원에게 표시) --</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.name || "(이름 없음)"}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-dark-600">
                지정한 플레이어에게만 투표 화면 하단에 이 개인 투표가 표시됩니다.
              </p>
            </div>
          )}

          {/* 투표 대상 */}
          <div>
            <label className="block text-xs text-dark-500 mb-1">투표 대상</label>
            <select
              value={question.targetMode}
              onChange={(e) => {
                const mode = e.target.value as VoteTargetMode;
                onChange({
                  targetMode: mode,
                  choices: mode === "custom-choices" ? question.choices : [],
                });
              }}
              className={inp}
            >
              {(Object.keys(TARGET_MODE_LABELS) as VoteTargetMode[]).map((m) => (
                <option key={m} value={m}>{TARGET_MODE_LABELS[m]}</option>
              ))}
            </select>
            {question.targetMode !== "custom-choices" && (
              <p className="text-xs text-dark-600 mt-1">
                자동 선택지 {buildAutoTargets(question.targetMode, players, npcs, victim).length}개
              </p>
            )}
          </div>

          {/* 커스텀 선택지 */}
          {question.targetMode === "custom-choices" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs text-dark-500">선택지</label>
                <button
                  type="button"
                  onClick={() => onChangeChoices([...question.choices, createVoteChoice()])}
                  className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                >
                  + 추가
                </button>
              </div>
              {question.choices.map((c, ci) => (
                <div key={c.id} className="flex gap-2">
                  <input
                    type="text"
                    value={c.label}
                    onChange={(e) => {
                      const next = question.choices.map((ch, i) =>
                        i === ci ? { ...ch, label: e.target.value } : ch
                      );
                      onChangeChoices(next);
                    }}
                    placeholder={`선택지 ${ci + 1}`}
                    className={inp + " flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => onChangeChoices(question.choices.filter((_, i) => i !== ci))}
                    className="text-xs text-dark-600 hover:text-red-400 px-2 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
        enabled ? "bg-mystery-600" : "bg-dark-700"
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
        enabled ? "translate-x-4" : ""
      }`} />
    </button>
  );
}

// ─── VoteEndingEditor (메인) ──────────────────────────────

interface VoteEndingEditorProps {
  game: GamePackage;
  onUpdate: (partial: Partial<GamePackage>) => void;
}

export default function VoteEndingEditor({
  game,
  onUpdate,
}: VoteEndingEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("vote");
  const [showPreStory, setShowPreStory] = useState(Boolean(game.scripts.vote.narration?.trim()));
  // 투표 전 텍스트 off 시 캐시 (데이터 유실 방지)
  const [narrationCache, setNarrationCache] = useState(game.scripts.vote.narration ?? "");
  const [showPersonalQuestions, setShowPersonalQuestions] = useState(
    (game.voteQuestions ?? []).some((q) => q.purpose === "personal")
  );

  // 옵션 토글로 layout shift가 발생해도 클릭 element의 viewport 위치를 보존.
  // 자세한 동작은 `./useScrollAnchor.ts` 참조.
  const captureScrollAnchor = useScrollAnchor();

  const ending = game.ending;
  const players = game.players ?? [];
  const npcs = game.story?.npcs ?? [];
  const victim = game.story?.victim;
  const voteQuestions = game.voteQuestions ?? [];
  const advancedVotingEnabled = game.advancedVotingEnabled ?? false;
  const voteScript = game.scripts.vote;

  // 기본 투표 질문 자동 생성/유지: voteRound=1, purpose="ending" 질문이 없으면 자동 생성
  const primaryQuestion = voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);

  useEffect(() => {
    if (!primaryQuestion) {
      const newQ = createVoteQuestion(1, "ending");
      onUpdate({ voteQuestions: [newQ, ...voteQuestions] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // primaryQuestion이 없으면 아직 생성 중이므로 fallback
  const currentPrimary = primaryQuestion ?? voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);

  function updateEnding(updated: EndingConfig) {
    onUpdate({ ending: updated });
  }

  function updateVoteScript(updated: ScriptSegment) {
    onUpdate({ scripts: { ...game.scripts, vote: updated } });
  }

  function setAdvancedVoting(enabled: boolean) {
    onUpdate({ advancedVotingEnabled: enabled });
  }

  function setVoteQuestions(questions: VoteQuestion[]) {
    onUpdate({ voteQuestions: questions });
  }

  function updatePrimaryQuestion(patch: Partial<VoteQuestion>) {
    if (!currentPrimary) return;
    setVoteQuestions(voteQuestions.map((q) =>
      q.id === currentPrimary.id ? { ...q, ...patch } : q
    ));
  }

  function updatePrimaryChoices(choices: VoteQuestionChoice[]) {
    updatePrimaryQuestion({ choices });
  }

  const personalQuestions = voteQuestions.filter((q) => q.purpose === "personal");
  const round2Questions = voteQuestions.filter((q) => q.voteRound === 2);

  function addQuestion(voteRound: number, purpose: "ending" | "personal" = "ending") {
    setVoteQuestions([...voteQuestions, createVoteQuestion(voteRound, purpose)]);
  }

  function updateQuestion(id: string, patch: Partial<VoteQuestion>) {
    setVoteQuestions(voteQuestions.map((q) => q.id === id ? { ...q, ...patch } : q));
  }

  function deleteQuestion(id: string) {
    setVoteQuestions(voteQuestions.filter((q) => q.id !== id));
  }

  function updateChoices(questionId: string, choices: VoteQuestionChoice[]) {
    updateQuestion(questionId, { choices });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "vote", label: "투표" },
    { id: "ending", label: "엔딩" },
    { id: "personal", label: "개인 엔딩" },
    { id: "author", label: "작가 후기" },
  ];

  // 범인 지정 변경 콜백 — 투표 탭 안 CulpritSelectorBox와 공유.
  // 자동 파생 모드("기본") player의 victoryCondition을 새 culprit에 맞춰 동기화.
  // override 모드("personal-goal" / "uncertain") player는 손대지 않는다.
  function handleChangeCulprit(culpritId: string) {
    const stillValid = isCulpritIdValid(culpritId, players, game.story);
    const nextCulpritId = stillValid ? culpritId : "";
    const syncedPlayers: Player[] = players.map((p) => {
      if (getVictoryConditionInputMode(p) !== "auto") return p;
      const expected: Player["victoryCondition"] = nextCulpritId === p.id ? "avoid-arrest" : "arrest-culprit";
      return p.victoryCondition === expected ? p : { ...p, victoryCondition: expected };
    });
    const playersChanged = syncedPlayers.some((p, i) => p !== players[i]);
    onUpdate({
      story: { ...game.story, culpritPlayerId: nextCulpritId },
      ...(playersChanged ? { players: syncedPlayers } : {}),
    });
  }
  function handleChangeCulpritScope(mode: "players-only" | "players-and-npcs") {
    const primary = voteQuestions.find((q) => q.purpose === "ending" && q.voteRound === 1);
    if (primary) {
      onUpdate({
        voteQuestions: voteQuestions.map((q) =>
          q.id === primary.id ? { ...q, targetMode: mode, choices: [] } : q,
        ),
      });
      return;
    }
    onUpdate({
      voteQuestions: [
        {
          id: crypto.randomUUID(),
          voteRound: 1,
          label: "",
          targetMode: mode,
          purpose: "ending",
          sortOrder: 0,
          choices: [],
        },
        ...voteQuestions,
      ],
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-50">투표 & 엔딩</h2>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-1 rounded-xl border border-dark-700 bg-dark-900/60 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-mystery-900/40 text-mystery-200 border border-mystery-700"
                : "text-dark-400 hover:text-dark-200 border border-transparent",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── 투표 탭 ─── */}
      {activeTab === "vote" && (
        <div data-maker-anchor="step-5-vote" className="space-y-6">

          {/* 범인 지정 — 투표 정답 결정. Story.culpritPlayerId ↔ vote 주 질문 targetMode 양방향 동기화. */}
          <CulpritSelectorBox
            story={game.story}
            syncedPlayers={players}
            voteQuestions={voteQuestions}
            onChangeCulprit={handleChangeCulprit}
            onChangeCulpritScope={handleChangeCulpritScope}
          />

          {/* 기본 투표 설정
              플레이어 화면 노출 순서(PlayerView.tsx:929~966)에 맞춰
              [투표 전 안내] → [질문 텍스트] → [투표 대상] → [커스텀 선택지] 순서로 입력. */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-dark-100">기본 투표</p>
            </div>

            {currentPrimary && (
              <div className="space-y-3">
                {/* 1. 투표 전 안내 — 플레이어 화면에서 가장 먼저 표시되는 영역 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-xs text-dark-500">투표 전 안내</label>
                    <ToggleSwitch
                      enabled={showPreStory}
                      onToggle={(e) => {
                        captureScrollAnchor(e);
                        if (showPreStory) {
                          setNarrationCache(voteScript.narration ?? "");
                          updateVoteScript({ ...voteScript, narration: "" });
                        } else {
                          updateVoteScript({ ...voteScript, narration: narrationCache });
                        }
                        setShowPreStory(!showPreStory);
                      }}
                    />
                  </div>
                  {showPreStory && (
                    <textarea
                      rows={3}
                      value={voteScript.narration}
                      onChange={(e) => {
                        updateVoteScript({ ...voteScript, narration: e.target.value });
                        setNarrationCache(e.target.value);
                      }}
                      placeholder="예: 모든 조사가 끝났습니다. 이제 최종 투표를 시작합니다."
                      className={inp + " resize-none"}
                    />
                  )}
                </div>

                {/* 2. 질문 텍스트 */}
                <div className="border-t border-dark-800/80 pt-3">
                  <label className="block text-xs text-dark-500 mb-1">질문 텍스트</label>
                  <input
                    type="text"
                    value={currentPrimary.label}
                    onChange={(e) => updatePrimaryQuestion({ label: e.target.value })}
                    placeholder="범인은 누구인가요?"
                    className={inp}
                  />
                </div>

                {/* 3. 투표 대상 — [범인 지정 따름 / 커스텀 선택지] 2-옵션 토글.
                    "범인 지정 따름"은 위 CulpritSelectorBox의 후보군 모드(players-only / players-and-npcs)를 그대로 따라간다.
                    "커스텀 선택지"는 targetMode="custom-choices"로 전환하고 메이커가 직접 선택지를 입력한다. */}
                <div>
                  <label className="block text-xs text-dark-500 mb-1">투표 대상</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        captureScrollAnchor(e);
                        // 위 culprit 박스가 현재 어느 후보군 모드인지 보고 그 값으로 정렬.
                        // 박스의 effectiveMode 결정 로직과 일관성을 맞춘다(NPC/피해자 범인이면 자동 확장).
                        const culprit = game.story.culpritPlayerId;
                        const isNonPlayerCulprit = Boolean(culprit) && !players.some((p) => p.id === culprit);
                        const followMode: VoteTargetMode = isNonPlayerCulprit
                          ? "players-and-npcs"
                          : currentPrimary.targetMode === "players-and-npcs"
                            ? "players-and-npcs"
                            : "players-only";
                        updatePrimaryQuestion({ targetMode: followMode, choices: [] });
                      }}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        currentPrimary.targetMode !== "custom-choices"
                          ? "border-mystery-600 bg-mystery-950/40 text-mystery-200"
                          : "border-dark-700 bg-dark-800/40 text-dark-400 hover:border-dark-500",
                      ].join(" ")}
                    >
                      범인 지정 따름
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        captureScrollAnchor(e);
                        updatePrimaryQuestion({ targetMode: "custom-choices" });
                      }}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        currentPrimary.targetMode === "custom-choices"
                          ? "border-mystery-600 bg-mystery-950/40 text-mystery-200"
                          : "border-dark-700 bg-dark-800/40 text-dark-400 hover:border-dark-500",
                      ].join(" ")}
                    >
                      커스텀 선택지
                    </button>
                  </div>
                  {currentPrimary.targetMode !== "custom-choices" && (
                    <p className="text-xs text-dark-600 mt-1">
                      위 범인 지정의 후보군({TARGET_MODE_LABELS[currentPrimary.targetMode]})을 따라갑니다 · 자동 선택지 {buildAutoTargets(currentPrimary.targetMode, players, npcs, victim).length}개
                    </p>
                  )}
                </div>

                {/* 4. 커스텀 선택지 — targetMode === "custom-choices"일 때만 노출 */}
                {currentPrimary.targetMode === "custom-choices" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs text-dark-500">선택지</label>
                      <button
                        type="button"
                        onClick={() => updatePrimaryChoices([...currentPrimary.choices, createVoteChoice()])}
                        className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
                      >
                        + 추가
                      </button>
                    </div>
                    {currentPrimary.choices.map((c, ci) => (
                      <div key={c.id} className="flex gap-2">
                        <input
                          type="text"
                          value={c.label}
                          onChange={(e) => {
                            const next = currentPrimary.choices.map((ch, i) =>
                              i === ci ? { ...ch, label: e.target.value } : ch
                            );
                            updatePrimaryChoices(next);
                          }}
                          placeholder={`선택지 ${ci + 1}`}
                          className={inp + " flex-1"}
                        />
                        <button
                          type="button"
                          onClick={() => updatePrimaryChoices(currentPrimary.choices.filter((_, i) => i !== ci))}
                          className="text-xs text-dark-600 hover:text-red-400 px-2 transition-colors"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                    {currentPrimary.choices.length === 0 && (
                      <p className="text-xs text-dark-600 py-2 text-center border border-dashed border-dark-700 rounded-lg">
                        선택지를 추가하세요
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 개인 질문 (캐릭터별 개인 투표) */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">개인 질문</p>
              </div>
              <ToggleSwitch
                enabled={showPersonalQuestions}
                onToggle={(e) => {
                  captureScrollAnchor(e);
                  setShowPersonalQuestions(!showPersonalQuestions);
                }}
              />
            </div>

            {showPersonalQuestions && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => addQuestion(1, "personal")}
                    className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                    + 질문 추가
                  </button>
                </div>
                {personalQuestions.length === 0 ? (
                  <p className="text-xs text-dark-600 text-center py-3 border border-dashed border-dark-700 rounded-xl">
                    질문 없음
                  </p>
                ) : (
                  personalQuestions.map((q) => (
                    <VoteQuestionForm
                      key={q.id}
                      question={q}
                      players={players}
                      npcs={npcs}
                      victim={victim}
                      onChange={(patch) => updateQuestion(q.id, patch)}
                      onDelete={() => deleteQuestion(q.id)}
                      onChangeChoices={(c) => updateChoices(q.id, c)}
                    />
                  ))
                )}
              </div>
            )}
          </section>

          {/* 2차 투표 설정 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">2차 투표 <span className="text-xs font-normal text-dark-500">(기본 투표 추가 분기)</span></p>
              </div>
              <ToggleSwitch
                enabled={advancedVotingEnabled}
                onToggle={(e) => {
                  captureScrollAnchor(e);
                  setAdvancedVoting(!advancedVotingEnabled);
                }}
              />
            </div>

            {advancedVotingEnabled && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-dark-600">1차 결과 조건 사용</p>
                  <button type="button" onClick={() => addQuestion(2, "ending")}
                    className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                    + 질문 추가
                  </button>
                </div>
                {round2Questions.length === 0 ? (
                  <p className="text-xs text-dark-600 text-center py-3 border border-dashed border-dark-700 rounded-xl">
                    질문 없음
                  </p>
                ) : (
                  round2Questions.map((q) => (
                    <VoteQuestionForm
                      key={q.id}
                      question={q}
                      isSecondRound
                      firstRoundQuestion={currentPrimary}
                      players={players}
                      npcs={npcs}
                      victim={victim}
                      onChange={(patch) => updateQuestion(q.id, patch)}
                      onDelete={() => deleteQuestion(q.id)}
                      onChangeChoices={(c) => updateChoices(q.id, c)}
                    />
                  ))
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ─── 엔딩 탭 ─── */}
      {activeTab === "ending" && (
        <div data-maker-anchor="step-5-branches">
          <EndingEditor
            ending={ending}
            players={players}
            npcs={npcs}
            victim={victim}
            voteQuestions={voteQuestions}
            advancedVotingEnabled={advancedVotingEnabled}
            onChange={updateEnding}
            section="branches"
          />
        </div>
      )}

      {/* ─── 개인 엔딩 탭 ─── */}
      {activeTab === "personal" && (
        <EndingEditor
          ending={ending}
          players={players}
          npcs={npcs}
          victim={victim}
          voteQuestions={voteQuestions}
          advancedVotingEnabled={advancedVotingEnabled}
          onChange={updateEnding}
          section="personal"
        />
      )}

      {/* ─── 작가 후기 탭 ─── */}
      {activeTab === "author" && (
        <div data-maker-anchor="step-5-author-notes">
          <EndingEditor
            ending={ending}
            players={players}
            npcs={npcs}
            victim={victim}
            voteQuestions={voteQuestions}
            advancedVotingEnabled={advancedVotingEnabled}
            onChange={updateEnding}
            section="author"
          />
        </div>
      )}
    </div>
  );
}
