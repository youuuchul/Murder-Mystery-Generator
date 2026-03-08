"use client";

import Button from "@/components/ui/Button";
import type { Story, Player, VictimInfo } from "@/types/game";

interface StoryEditorProps {
  story: Story;
  players: Player[];
  onChange: (story: Story) => void;
  onSave: () => void;
  saving: boolean;
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-dark-200 mb-1">
        {label} {required && <span className="text-mystery-400">*</span>}
      </label>
      {hint && <p className="text-xs text-dark-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}

const ta = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none";
const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition";
const sel = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition";

export default function StoryEditor({ story, players, onChange, onSave, saving }: StoryEditorProps) {
  function update<K extends keyof Story>(key: K, value: Story[K]) {
    onChange({ ...story, [key]: value });
  }

  function updateVictim<K extends keyof VictimInfo>(key: K, value: VictimInfo[K]) {
    onChange({ ...story, victim: { ...story.victim, [key]: value } });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-dark-50">사건 개요</h2>
        <p className="text-sm text-dark-500 mt-1">게임의 전체 스토리와 사건을 설정합니다.</p>
      </div>

      {/* ── 시놉시스 ── */}
      <Field label="스토리 시놉시스" hint="메이커 전용 — 전체 진실·플롯을 자유롭게 정리. 플레이어에게 노출되지 않습니다.">
        <textarea rows={5} value={story.synopsis}
          onChange={(e) => update("synopsis", e.target.value)}
          placeholder="예) 저택 주인이 독살됐다. 범인은 장남으로, 유산을 독차지하기 위해 와인에 독을 탔다..."
          className={ta} />
        <p className="text-xs text-dark-500 mt-1">{story.synopsis.length}자</p>
      </Field>

      {/* ── 피해자 정보 ── */}
      <div className="border border-dark-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">💀</span>
          <h3 className="text-sm font-semibold text-dark-100">피해자 정보</h3>
          <span className="text-xs text-dark-500">(게임 시작 시 전원 공개)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="피해자 이름" required>
            <input type="text" value={story.victim.name}
              onChange={(e) => updateVictim("name", e.target.value)}
              placeholder="예: 헨리 브라운 경"
              className={inp} />
          </Field>
          <Field label="배경">
            <input type="text" value={story.victim.background}
              onChange={(e) => updateVictim("background", e.target.value)}
              placeholder="예: 저택 주인, 73세 은퇴 사업가"
              className={inp} />
          </Field>
        </div>
        <Field label="사망 경위">
          <textarea rows={3} value={story.victim.deathCircumstances}
            onChange={(e) => updateVictim("deathCircumstances", e.target.value)}
            placeholder="언제, 어디서, 어떤 상태로 발견됐는지 (플레이어 공개 정보)"
            className={ta} />
        </Field>
      </div>

      {/* ── 플레이어 공개 사건 설명 ── */}
      <Field label="사건 설명 (플레이어 공개)" required>
        <textarea rows={4} value={story.incident}
          onChange={(e) => update("incident", e.target.value)}
          placeholder="게임 시작 시 모든 플레이어에게 공개되는 사건 개요"
          className={ta} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Field label="배경 장소" required>
          <input type="text" value={story.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="예: 브라운 저택"
            className={inp} />
        </Field>
        <Field label="범행 수법" hint="GM only">
          <input type="text" value={story.method}
            onChange={(e) => update("method", e.target.value)}
            placeholder="예: 와인에 청산가리 혼입"
            className={inp} />
        </Field>
      </div>

      <Field label="범행 동기" hint="GM only — 플레이어에게 노출되지 않습니다.">
        <textarea rows={3} value={story.motive}
          onChange={(e) => update("motive", e.target.value)}
          placeholder="범인의 동기를 작성하세요."
          className={ta} />
      </Field>

      {/* ── 범인 선택 ── */}
      <Field
        label="범인 (GM only)"
        hint={players.length === 0 ? "Step 3(플레이어)에서 먼저 캐릭터를 추가하세요." : undefined}
      >
        <select
          value={story.culpritPlayerId}
          onChange={(e) => update("culpritPlayerId", e.target.value)}
          disabled={players.length === 0}
          className={sel}
        >
          <option value="">— 범인을 선택하세요 —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name || `(이름 없음)`}</option>
          ))}
        </select>
        {story.culpritPlayerId && (
          <p className="text-xs text-mystery-400 mt-1">
            ✓ {players.find((p) => p.id === story.culpritPlayerId)?.name ?? story.culpritPlayerId}
          </p>
        )}
      </Field>

      {/* ── 타임라인 ── */}
      <Field label="사건 전 타임라인">
        <div className="space-y-2">
          {story.timeline.map((ev, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={ev.time}
                onChange={(e) => {
                  const next = [...story.timeline];
                  next[idx] = { ...ev, time: e.target.value };
                  update("timeline", next);
                }}
                placeholder="시각" className="w-28 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 text-sm transition" />
              <input type="text" value={ev.description}
                onChange={(e) => {
                  const next = [...story.timeline];
                  next[idx] = { ...ev, description: e.target.value };
                  update("timeline", next);
                }}
                placeholder="내용" className="flex-1 bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 text-sm transition" />
              <button type="button" onClick={() => update("timeline", story.timeline.filter((_, i) => i !== idx))}
                className="px-2 text-dark-500 hover:text-red-400 transition-colors text-sm">✕</button>
            </div>
          ))}
          <button type="button"
            onClick={() => update("timeline", [...story.timeline, { time: "", description: "" }])}
            className="text-sm text-mystery-400 hover:text-mystery-300 transition-colors">
            + 항목 추가
          </button>
        </div>
      </Field>

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">저장</Button>
      </div>
    </div>
  );
}
