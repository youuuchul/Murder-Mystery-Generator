"use client";

import Button from "@/components/ui/Button";
import type { Story, Player, VictimInfo, StoryTimeline, TimelineSlot } from "@/types/game";

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
const DEFAULT_TIMELINE_SLOT_LABELS = ["19:00", "19:30", "20:00", "20:30"];

/** 타임라인 슬롯 1개를 생성한다. */
function createTimelineSlot(label = ""): TimelineSlot {
  return {
    id: crypto.randomUUID(),
    label,
  };
}

/** 타임라인을 처음 켰을 때 바로 쓸 수 있는 기본 슬롯 세트를 만든다. */
function createDefaultTimelineSlots(): TimelineSlot[] {
  return DEFAULT_TIMELINE_SLOT_LABELS.map((label) => createTimelineSlot(label));
}

export default function StoryEditor({ story, players, onChange, onSave, saving }: StoryEditorProps) {
  function update<K extends keyof Story>(key: K, value: Story[K]) {
    onChange({ ...story, [key]: value });
  }

  function updateVictim<K extends keyof VictimInfo>(key: K, value: VictimInfo[K]) {
    onChange({ ...story, victim: { ...story.victim, [key]: value } });
  }

  function updateTimeline(nextTimeline: StoryTimeline) {
    onChange({ ...story, timeline: nextTimeline });
  }

  function updateTimelineSlot(slotId: string, label: string) {
    updateTimeline({
      ...story.timeline,
      slots: story.timeline.slots.map((slot) => (
        slot.id === slotId ? { ...slot, label } : slot
      )),
    });
  }

  function toggleTimeline(enabled: boolean) {
    updateTimeline({
      enabled,
      slots: enabled && story.timeline.slots.length === 0
        ? createDefaultTimelineSlots()
        : story.timeline.slots,
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-dark-50">사건 개요</h2>
        <p className="text-sm text-dark-500 mt-1">게임의 전체 스토리, 피해자 정보, 공통 이미지 정보를 설정합니다.</p>
      </div>

      {/* ── 피해자 정보 ── */}
      <div className="border border-dark-700 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
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
        <Field label="대표 지도 / 참고 이미지 URL" hint="GM 메인 보드에 띄울 공통 이미지 또는 지도입니다.">
          <input type="url" value={story.mapImageUrl ?? ""}
            onChange={(e) => update("mapImageUrl", e.target.value || undefined)}
            placeholder="https://..."
            className={inp} />
        </Field>
      </div>

      <div className="border border-dark-700 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">행동 타임라인</h3>
            <p className="text-xs text-dark-500 mt-1">
              시간대 슬롯은 여기서 관리하고, 캐릭터별 행동 입력은 Step 3(플레이어)에서 연결합니다.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => toggleTimeline(false)}
              className={[
                "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                !story.timeline.enabled
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
                story.timeline.enabled
                  ? "border-mystery-600 bg-mystery-900/30 text-mystery-200"
                  : "border-dark-700 text-dark-500 hover:text-dark-300",
              ].join(" ")}
            >
              사용
            </button>
          </div>
        </div>

        {story.timeline.enabled ? (
          <div className="space-y-3">
            {story.timeline.slots.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-dark-700 rounded-xl">
                <p className="text-xs text-dark-600">시간대 슬롯이 없습니다. 첫 슬롯을 추가하세요.</p>
              </div>
            ) : (
              story.timeline.slots.map((slot, index) => (
                <div key={slot.id} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-xs text-dark-500 text-right">슬롯 {index + 1}</span>
                  <input
                    type="text"
                    value={slot.label}
                    onChange={(e) => updateTimelineSlot(slot.id, e.target.value)}
                    placeholder="예: 20:00 ~ 20:30"
                    className={inp}
                  />
                  <button
                    type="button"
                    onClick={() => updateTimeline({
                      ...story.timeline,
                      slots: story.timeline.slots.filter((item) => item.id !== slot.id),
                    })}
                    className="text-xs text-dark-500 hover:text-red-400 transition-colors shrink-0 px-1"
                  >
                    삭제
                  </button>
                </div>
              ))
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-dark-600">
                슬롯 순서는 플레이어 화면에서도 같은 순서로 표시됩니다.
              </p>
              <button
                type="button"
                onClick={() => updateTimeline({
                  ...story.timeline,
                  slots: [...story.timeline.slots, createTimelineSlot()],
                })}
                className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors shrink-0"
              >
                + 시간대 슬롯 추가
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
            <p className="text-xs text-dark-600">
              현재 타임라인을 사용하지 않습니다. 켜면 기본 시간대 슬롯을 만들고 플레이어별 행동 입력을 활성화합니다.
            </p>
          </div>
        )}
      </div>

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
            선택됨: {players.find((p) => p.id === story.culpritPlayerId)?.name ?? story.culpritPlayerId}
          </p>
        )}
      </Field>

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">저장</Button>
      </div>
    </div>
  );
}
