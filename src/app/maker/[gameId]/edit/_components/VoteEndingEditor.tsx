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
    isPrimary: false,
    purpose,
    sortOrder: 0,
    choices: [],
  };
}

function createVoteChoice(): VoteQuestionChoice {
  return { id: crypto.randomUUID(), label: "" };
}

// ─── VoteQuestionForm ─────────────────────────────────────

function VoteQuestionForm({
  question,
  isSecondRound,
  firstRoundQuestions,
  onChange,
  onDelete,
  onChangeChoices,
}: {
  question: VoteQuestion;
  isSecondRound?: boolean;
  firstRoundQuestions?: VoteQuestion[];
  onChange: (patch: Partial<VoteQuestion>) => void;
  onDelete: () => void;
  onChangeChoices: (c: VoteQuestionChoice[]) => void;
}) {
  const [expanded, setExpanded] = useState(!question.label);

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
              {question.isPrimary && (
                <span className="rounded-full border border-mystery-800 bg-mystery-950/30 px-2 py-0.5 text-[11px] text-mystery-400">
                  주 질문
                </span>
              )}
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
          <div>
            <label className="block text-xs text-dark-500 mb-1">질문 텍스트</label>
            <input
              type="text"
              value={question.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="예: 범인은 누구인가?, 당신의 비밀 임무 대상은?"
              className={inp}
            />
          </div>

          <div>
            <label className="block text-xs text-dark-500 mb-1">보충 설명 (선택)</label>
            <input
              type="text"
              value={question.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              placeholder="질문에 대한 추가 안내"
              className={inp}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            </div>
            <div className="flex items-end">
              {question.purpose === "ending" && (
                <label className="flex items-center gap-2 cursor-pointer py-2">
                  <input
                    type="checkbox"
                    checked={question.isPrimary}
                    onChange={(e) => onChange({ isPrimary: e.target.checked })}
                    className="accent-mystery-500 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-dark-400">엔딩 분기 결정용 (주 질문)</span>
                </label>
              )}
            </div>
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

          {/* 2차 투표: 트리거 조건 + 스토리 텍스트 */}
          {isSecondRound && firstRoundQuestions && firstRoundQuestions.length > 0 && (
            <div className="space-y-3 border-t border-dark-700 pt-3">
              <div>
                <label className="block text-xs text-dark-500 mb-1">트리거 조건 — 1차 투표 결과가 다음일 때 2차 투표 시작</label>
                <select
                  value={question.triggerCondition?.questionId ?? ""}
                  onChange={(e) => {
                    const qId = e.target.value;
                    onChange({
                      triggerCondition: qId
                        ? { requiresVoteRound: 1, questionId: qId, resultEquals: question.triggerCondition?.resultEquals ?? "" }
                        : undefined,
                    });
                  }}
                  className={inp}
                >
                  <option value="">— 1차 질문 선택 —</option>
                  {firstRoundQuestions.map((fq) => (
                    <option key={fq.id} value={fq.id}>{fq.label || "(질문 없음)"}</option>
                  ))}
                </select>
              </div>
              {question.triggerCondition?.questionId && (() => {
                const refQ = firstRoundQuestions.find((fq) => fq.id === question.triggerCondition?.questionId);
                if (!refQ || refQ.targetMode !== "custom-choices") return null;
                return (
                  <div>
                    <label className="block text-xs text-dark-500 mb-1">1차 투표 결과 선택지</label>
                    <select
                      value={question.triggerCondition?.resultEquals ?? ""}
                      onChange={(e) => onChange({
                        triggerCondition: {
                          ...question.triggerCondition!,
                          resultEquals: e.target.value,
                        },
                      })}
                      className={inp}
                    >
                      <option value="">— 선택지 선택 —</option>
                      {refQ.choices.map((c) => (
                        <option key={c.id} value={c.id}>{c.label || "(선택지 없음)"}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
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

  // 질문 CRUD
  const endingQuestions = voteQuestions.filter((q) => q.purpose === "ending" && q.voteRound === 1);
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
          {/* 투표 안내 텍스트 */}
          <section className="rounded-2xl border border-dark-800 bg-dark-900/55 p-4 space-y-3">
            <p className="text-sm font-semibold text-dark-100">투표 안내</p>
            <div>
              <label className="block text-xs text-dark-500 mb-1">투표 안내 텍스트</label>
              <textarea
                rows={3}
                value={voteScript.narration}
                onChange={(e) => updateVoteScript({ ...voteScript, narration: e.target.value })}
                placeholder="투표 규칙을 짧고 분명하게 안내하세요."
                className={inp + " resize-none"}
              />
            </div>
            <div>
              <label className="block text-xs text-dark-500 mb-1">GM 노트 (선택)</label>
              <textarea
                rows={2}
                value={voteScript.gmNote ?? ""}
                onChange={(e) => updateVoteScript({ ...voteScript, gmNote: e.target.value || undefined })}
                placeholder="GM 전용 메모"
                className={inp + " resize-none"}
              />
            </div>
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
                    <button type="button" onClick={() => addQuestion(1, "ending")}
                      className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors">
                      + 질문 추가
                    </button>
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
                      firstRoundQuestions={endingQuestions}
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
          voteQuestions={voteQuestions}
          advancedVotingEnabled={advancedVotingEnabled}
          onChange={updateEnding}
          section="author"
        />
      )}
    </div>
  );
}
