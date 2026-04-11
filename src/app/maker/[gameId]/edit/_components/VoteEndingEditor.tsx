"use client";

import { useState } from "react";
import EndingEditor from "./EndingEditor";
import type {
  EndingConfig,
  GamePackage,
  Player,
  ScriptSegment,
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
  "players-and-npcs": "플레이어 + NPC",
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

/** 투표 대상이 플레이어/NPC 모드일 때 자동 선택지 목록 생성 */
function buildAutoTargets(
  targetMode: VoteTargetMode,
  players: Player[],
  npcs: StoryNpc[]
): { id: string; label: string }[] {
  if (targetMode === "players-only") {
    return players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" }));
  }
  if (targetMode === "players-and-npcs") {
    return [
      ...players.map((p) => ({ id: p.id, label: p.name || "(이름 없음)" })),
      ...npcs.map((n) => ({ id: n.id, label: n.name || "(NPC)" })),
    ];
  }
  return []; // custom-choices는 직접 입력
}

/** 질문의 실제 선택지 목록 (커스텀이면 choices, 아니면 자동 생성) */
function getEffectiveChoices(
  q: VoteQuestion,
  players: Player[],
  npcs: StoryNpc[]
): { id: string; label: string }[] {
  if (q.targetMode === "custom-choices") return q.choices;
  return buildAutoTargets(q.targetMode, players, npcs);
}

// ─── VoteQuestionForm ─────────────────────────────────────

function VoteQuestionForm({
  question,
  isSecondRound,
  firstRoundQuestion,
  players,
  npcs,
  onChange,
  onDelete,
  onChangeChoices,
}: {
  question: VoteQuestion;
  isSecondRound?: boolean;
  firstRoundQuestion?: VoteQuestion;
  players: Player[];
  npcs: StoryNpc[];
  onChange: (patch: Partial<VoteQuestion>) => void;
  onDelete: () => void;
  onChangeChoices: (c: VoteQuestionChoice[]) => void;
}) {
  const [expanded, setExpanded] = useState(!question.label);
  const firstRoundChoices = firstRoundQuestion
    ? getEffectiveChoices(firstRoundQuestion, players, npcs)
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
              <span className="rounded-full border border-dark-700 bg-dark-900 px-2 py-0.5 text-[11px] text-dark-400">
                {question.purpose === "personal" ? "개인 목표" : "엔딩 결정"}
              </span>
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
                  <option value="">— 1차 투표 선택지 선택 —</option>
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
                선택지: {buildAutoTargets(question.targetMode, players, npcs).map((t) => t.label).join(", ") || "없음"}
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

// ─── VoteEndingEditor (메인) ──────────────────────────────

interface VoteEndingEditorProps {
  game: GamePackage;
  onUpdate: (partial: Partial<GamePackage>) => void;
}

export default function VoteEndingEditor({ game, onUpdate }: VoteEndingEditorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("vote");
  const [showPreStory, setShowPreStory] = useState(Boolean(game.scripts.vote.narration?.trim()));

  const ending = game.ending;
  const players = game.players ?? [];
  const npcs = game.story?.npcs ?? [];
  const voteQuestions = game.voteQuestions ?? [];
  const advancedVotingEnabled = game.advancedVotingEnabled ?? false;
  const voteScript = game.scripts.vote;

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

  const endingQuestions = voteQuestions.filter((q) => q.purpose === "ending" && q.voteRound === 1);
  const endingQuestion1 = endingQuestions[0]; // 1차 엔딩 결정 투표
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-dark-50">투표 & 엔딩</h2>
        <p className="mt-1 text-sm text-dark-500">
          투표 설정, 분기 엔딩, 개인 엔딩, 작가 후기를 관리합니다.
        </p>
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
        <div className="space-y-6">

          {/* 투표 전 스토리 텍스트 (on/off) */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">투표 전 안내</p>
                <p className="text-xs text-dark-500 mt-0.5">투표 시작 전 플레이어에게 표시할 안내 텍스트입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPreStory(!showPreStory);
                  if (showPreStory) updateVoteScript({ ...voteScript, narration: "" });
                }}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                  showPreStory ? "bg-mystery-600" : "bg-dark-700"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  showPreStory ? "translate-x-4" : ""
                }`} />
              </button>
            </div>
            {showPreStory && (
              <textarea
                rows={3}
                value={voteScript.narration}
                onChange={(e) => updateVoteScript({ ...voteScript, narration: e.target.value })}
                placeholder="예: 모든 조사가 끝났습니다. 이제 최종 투표를 시작합니다."
                className={inp + " resize-none"}
              />
            )}
          </section>

          {/* 고급 투표 설정 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-100">고급 투표</p>
                <p className="mt-1 text-xs text-dark-500">
                  비활성화 시 기본 범인 투표 (검거/미검거)만 진행됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedVoting(!advancedVotingEnabled)}
                className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                  advancedVotingEnabled ? "bg-mystery-600" : "bg-dark-700"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  advancedVotingEnabled ? "translate-x-4" : ""
                }`} />
              </button>
            </div>

            {advancedVotingEnabled && (
              <div className="space-y-6 pt-2">
                {/* 엔딩 결정 투표 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">엔딩 결정 투표</p>
                      <p className="text-xs text-dark-600 mt-0.5">투표 결과가 엔딩 분기를 결정합니다.</p>
                    </div>
                    {endingQuestions.length === 0 && (
                      <button type="button" onClick={() => addQuestion(1, "ending")}
                        className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                        + 질문 추가
                      </button>
                    )}
                  </div>
                  {endingQuestions.length === 0 && (
                    <p className="text-xs text-dark-600 text-center py-3 border border-dashed border-dark-700 rounded-xl">
                      질문을 추가하면 기본 범인 투표 대신 사용됩니다.
                    </p>
                  )}
                  {endingQuestions.map((q) => (
                    <VoteQuestionForm
                      key={q.id}
                      question={q}
                      players={players}
                      npcs={npcs}
                      onChange={(patch) => updateQuestion(q.id, patch)}
                      onDelete={() => deleteQuestion(q.id)}
                      onChangeChoices={(c) => updateChoices(q.id, c)}
                    />
                  ))}
                </div>

                {/* 2차 투표 (진엔딩) */}
                <div className="space-y-3 border-t border-dark-700 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-mystery-300/80">2차 투표 (진엔딩)</p>
                      <p className="text-xs text-dark-600 mt-0.5">1차 투표 특정 결과일 때만 추가 투표를 진행합니다.</p>
                    </div>
                    <button type="button" onClick={() => addQuestion(2, "ending")}
                      className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                      + 질문 추가
                    </button>
                  </div>
                  {round2Questions.map((q) => (
                    <VoteQuestionForm
                      key={q.id}
                      question={q}
                      isSecondRound
                      firstRoundQuestion={endingQuestion1}
                      players={players}
                      npcs={npcs}
                      onChange={(patch) => updateQuestion(q.id, patch)}
                      onDelete={() => deleteQuestion(q.id)}
                      onChangeChoices={(c) => updateChoices(q.id, c)}
                    />
                  ))}
                </div>

                {/* 개인 목표 질문 */}
                <div className="space-y-3 border-t border-dark-700 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-dark-400">개인 목표 질문</p>
                      <p className="text-xs text-dark-600 mt-0.5">엔딩 분기와 무관. 승점/비밀 임무 확인용입니다.</p>
                    </div>
                    <button type="button" onClick={() => addQuestion(1, "personal")}
                      className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                      + 질문 추가
                    </button>
                  </div>
                  {personalQuestions.map((q) => (
                    <VoteQuestionForm
                      key={q.id}
                      question={q}
                      players={players}
                      npcs={npcs}
                      onChange={(patch) => updateQuestion(q.id, patch)}
                      onDelete={() => deleteQuestion(q.id)}
                      onChangeChoices={(c) => updateChoices(q.id, c)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ─── 엔딩 탭 ─── */}
      {activeTab === "ending" && (
        <EndingEditor
          ending={ending}
          players={players}
          npcs={npcs}
          voteQuestions={voteQuestions}
          advancedVotingEnabled={advancedVotingEnabled}
          onChange={updateEnding}
          section="branches"
        />
      )}

      {/* ─── 개인 엔딩 탭 ─── */}
      {activeTab === "personal" && (
        <EndingEditor
          ending={ending}
          players={players}
          npcs={npcs}
          voteQuestions={voteQuestions}
          advancedVotingEnabled={advancedVotingEnabled}
          onChange={updateEnding}
          section="personal"
        />
      )}

      {/* ─── 작가 후기 탭 ─── */}
      {activeTab === "author" && (
        <EndingEditor
          ending={ending}
          players={players}
          npcs={npcs}
          voteQuestions={voteQuestions}
          advancedVotingEnabled={advancedVotingEnabled}
          onChange={updateEnding}
          section="author"
        />
      )}
    </div>
  );
}
