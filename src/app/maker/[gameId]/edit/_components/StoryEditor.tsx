"use client";

import { useState, type ChangeEvent } from "react";
import Button from "@/components/ui/Button";
import type {
  GamePackage,
  Player,
  ScriptSegment,
  Story,
  StoryNpc,
  StoryTimeline,
  TimelineSlot,
  VictimInfo,
} from "@/types/game";

interface StoryEditorProps {
  gameId: GamePackage["id"];
  story: Story;
  opening: ScriptSegment;
  players: Player[];
  onChangeStory: (story: Story) => void;
  onChangeOpening: (opening: ScriptSegment) => void;
  onSave: () => void;
  saving: boolean;
}

function Field({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-dark-200">
        {label} {required && <span className="text-mystery-400">*</span>}
      </label>
      {hint && <p className="mb-2 text-xs text-dark-500">{hint}</p>}
      {children}
    </div>
  );
}

const ta = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none";
const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition";
const sel = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition";
const DEFAULT_TIMELINE_SLOT_LABELS = ["19:00", "19:30", "20:00", "20:30"];
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

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

/** 새 NPC 입력 블록 기본값을 만든다. */
function createNpc(): StoryNpc {
  return {
    id: crypto.randomUUID(),
    name: "",
    background: "",
    imageUrl: undefined,
  };
}

export default function StoryEditor({
  gameId,
  story,
  opening,
  players,
  onChangeStory,
  onChangeOpening,
  onSave,
  saving,
}: StoryEditorProps) {
  const [uploadingAssetTarget, setUploadingAssetTarget] = useState<string | null>(null);

  function updateStory<K extends keyof Story>(key: K, value: Story[K]) {
    onChangeStory({ ...story, [key]: value });
  }

  function updateVictim<K extends keyof VictimInfo>(key: K, value: VictimInfo[K]) {
    onChangeStory({ ...story, victim: { ...story.victim, [key]: value } });
  }

  function updateTimeline(nextTimeline: StoryTimeline) {
    onChangeStory({ ...story, timeline: nextTimeline });
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

  function updateNpc(index: number, partial: Partial<StoryNpc>) {
    updateStory("npcs", story.npcs.map((npc, npcIndex) => (
      npcIndex === index ? { ...npc, ...partial } : npc
    )));
  }

  /**
   * Step 2 공개 이미지들을 같은 story scope로 업로드해 내부 에셋 URL을 반환한다.
   */
  async function uploadStoryImage(file: File, label: string): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "story");

    try {
      const res = await fetch(`/api/games/${gameId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error ?? `${label} 업로드 실패`);
        return null;
      }

      return data.url as string;
    } catch (error) {
      console.error(`${label} 업로드 실패:`, error);
      alert(`${label} 업로드 중 오류가 발생했습니다.`);
      return null;
    }
  }

  /** 현재 어떤 대상 이미지가 업로드 중인지 비교해 버튼 상태를 제어한다. */
  function isUploadingAsset(target: string): boolean {
    return uploadingAssetTarget === target;
  }

  /**
   * 대표 지도 이미지를 업로드하고 story.mapImageUrl에 내부 에셋 URL을 연결한다.
   * 라운드 override가 없을 때 플레이어/GM 공통 기본 이미지로 사용된다.
   */
  async function handleMapImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploadingAssetTarget("map");
    const uploadedUrl = await uploadStoryImage(file, "대표 지도");
    if (uploadedUrl) {
      updateStory("mapImageUrl", uploadedUrl);
    }
    setUploadingAssetTarget(null);
  }

  /** 피해자 사진을 업로드하고 공개 인물 정보 카드에 사용할 URL을 연결한다. */
  async function handleVictimImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploadingAssetTarget("victim");
    const uploadedUrl = await uploadStoryImage(file, "피해자 사진");
    if (uploadedUrl) {
      updateVictim("imageUrl", uploadedUrl);
    }
    setUploadingAssetTarget(null);
  }

  /** NPC 사진을 업로드하고 해당 NPC의 공개 인물 이미지 URL을 갱신한다. */
  async function handleNpcImageUpload(index: number, npcId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const target = `npc:${npcId}`;
    setUploadingAssetTarget(target);
    const uploadedUrl = await uploadStoryImage(file, "NPC 사진");
    if (uploadedUrl) {
      updateNpc(index, { imageUrl: uploadedUrl });
    }
    setUploadingAssetTarget(null);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-dark-50">오프닝 / 배경 설정</h2>
        <p className="mt-1 text-sm text-dark-500">
          오프닝 도입, 범인 지정, 대표 지도, 피해자/NPC 공개 정보와 타임라인을 함께 설정합니다.
        </p>
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-dark-100">오프닝</h3>
          <p className="mt-1 text-xs text-dark-500">
            도입부 스토리 텍스트와 오프닝용 미디어를 가장 먼저 정리합니다.
          </p>
        </div>

        <Field label="오프닝 스토리 텍스트" required>
          <textarea
            rows={6}
            value={opening.narration}
            onChange={(e) => onChangeOpening({ ...opening, narration: e.target.value })}
            placeholder="사건이 시작되는 분위기와 플레이어가 처음 받아야 할 인상을 적어주세요."
            className={ta}
          />
        </Field>

        <Field label="오프닝 진행 가이드">
          <textarea
            rows={4}
            value={opening.gmNote ?? ""}
            onChange={(e) => onChangeOpening({ ...opening, gmNote: e.target.value || undefined })}
            placeholder="영상 재생, 오프닝 텍스트 낭독, 첫 안내 순서 등을 간단히 정리하세요."
            className={ta}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="오프닝 영상 URL">
            <input
              type="url"
              value={opening.videoUrl ?? ""}
              onChange={(e) => onChangeOpening({ ...opening, videoUrl: e.target.value || undefined })}
              placeholder="https://..."
              className={inp}
            />
          </Field>
          <Field label="오프닝 배경 음악 URL">
            <input
              type="url"
              value={opening.backgroundMusic ?? ""}
              onChange={(e) => onChangeOpening({ ...opening, backgroundMusic: e.target.value || undefined })}
              placeholder="https://..."
              className={inp}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-dark-100">범인 지정</h3>
          <p className="mt-1 text-xs text-dark-500">
            엔딩 분기와 투표 결과 판정에 사용할 범인을 지정합니다.
          </p>
        </div>

        <Field
          label="범인"
          hint={players.length === 0 ? "Step 3(플레이어)에서 먼저 캐릭터를 추가하세요." : undefined}
        >
          <select
            value={story.culpritPlayerId}
            onChange={(e) => updateStory("culpritPlayerId", e.target.value)}
            disabled={players.length === 0}
            className={sel}
          >
            <option value="">— 범인을 선택하세요 —</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name || "(이름 없음)"}
              </option>
            ))}
          </select>
          {story.culpritPlayerId && (
            <p className="mt-1 text-xs text-mystery-400">
              선택됨: {players.find((player) => player.id === story.culpritPlayerId)?.name ?? story.culpritPlayerId}
            </p>
          )}
        </Field>
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-dark-100">대표 지도 / 참고 이미지</h3>
          <p className="mt-1 text-xs text-dark-500">
            기본 공통 이미지입니다. 라운드별 이미지가 없으면 이 이미지를 계속 사용합니다.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-dark-800 bg-dark-900/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-dark-200">대표 지도 업로드</p>
            <p className="mt-1 text-xs text-dark-500">
              URL 입력 없이 바로 업로드해 기본 공통 이미지로 사용할 수 있습니다.
            </p>
          </div>
          <label className="shrink-0">
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={handleMapImageUpload}
              disabled={isUploadingAsset("map")}
            />
            <span className="inline-flex items-center justify-center rounded-lg border border-dark-600 px-3 py-2 text-sm text-dark-200 hover:border-dark-400 transition-colors cursor-pointer">
              {isUploadingAsset("map") ? "업로드 중…" : "이미지 업로드"}
            </span>
          </label>
        </div>

        <Field label="대표 지도 / 참고 이미지 URL" hint="GM 메인 보드에 띄울 기본 지도 또는 참고 이미지입니다.">
          <input
            type="url"
            value={story.mapImageUrl ?? ""}
            onChange={(e) => updateStory("mapImageUrl", e.target.value || undefined)}
            placeholder="https://..."
            className={inp}
          />
        </Field>

        {story.mapImageUrl ? (
          <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40">
            <img
              src={story.mapImageUrl}
              alt="대표 지도 미리보기"
              className="h-56 w-full object-cover"
            />
            <div className="flex items-center justify-between gap-3 border-t border-dark-700 bg-dark-900/60 px-3 py-2">
              <p className="truncate text-xs text-dark-500">{story.mapImageUrl}</p>
              <button
                type="button"
                onClick={() => updateStory("mapImageUrl", undefined)}
                className="shrink-0 text-xs text-dark-500 hover:text-red-400 transition-colors"
              >
                이미지 제거
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-dark-100">피해자 정보</h3>
          <span className="text-xs text-dark-500">(플레이어 인물 정보에서 공개)</span>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-dark-800 bg-dark-900/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-dark-200">피해자 사진 업로드</p>
            <p className="mt-1 text-xs text-dark-500">
              플레이어 인물 정보 탭과 캐릭터 선택 화면에서 쓸 이미지를 바로 올립니다.
            </p>
          </div>
          <label className="shrink-0">
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={handleVictimImageUpload}
              disabled={isUploadingAsset("victim")}
            />
            <span className="inline-flex items-center justify-center rounded-lg border border-dark-600 px-3 py-2 text-sm text-dark-200 hover:border-dark-400 transition-colors cursor-pointer">
              {isUploadingAsset("victim") ? "업로드 중…" : "이미지 업로드"}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="피해자 이름" required>
            <input
              type="text"
              value={story.victim.name}
              onChange={(e) => updateVictim("name", e.target.value)}
              placeholder="예: 헨리 브라운 경"
              className={inp}
            />
          </Field>
          <Field label="피해자 사진 URL">
            <input
              type="url"
              value={story.victim.imageUrl ?? ""}
              onChange={(e) => updateVictim("imageUrl", e.target.value || undefined)}
              placeholder="https://..."
              className={inp}
            />
          </Field>
        </div>

        {story.victim.imageUrl ? (
          <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40">
            <img
              src={story.victim.imageUrl}
              alt={story.victim.name || "피해자 사진 미리보기"}
              className="h-56 w-full object-cover"
            />
            <div className="flex items-center justify-between gap-3 border-t border-dark-700 bg-dark-900/60 px-3 py-2">
              <p className="truncate text-xs text-dark-500">{story.victim.imageUrl}</p>
              <button
                type="button"
                onClick={() => updateVictim("imageUrl", undefined)}
                className="shrink-0 text-xs text-dark-500 hover:text-red-400 transition-colors"
              >
                이미지 제거
              </button>
            </div>
          </div>
        ) : null}

        <Field label="배경">
          <textarea
            rows={3}
            value={story.victim.background}
            onChange={(e) => updateVictim("background", e.target.value)}
            placeholder="예: 저택 주인, 73세 은퇴 사업가"
            className={ta}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">NPC 인물</h3>
            <p className="mt-1 text-xs text-dark-500">
              피해자 외에 플레이어가 참고할 공개 인물을 추가합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateStory("npcs", [...story.npcs, createNpc()])}
            className="shrink-0 text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + NPC 추가
          </button>
        </div>

        {story.npcs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
            <p className="text-xs text-dark-600">등록된 NPC가 없습니다. 필요하면 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {story.npcs.map((npc, index) => (
              <div key={npc.id} className="rounded-xl border border-dark-700/70 bg-dark-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-dark-100">
                    {npc.name || `NPC ${index + 1}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => updateStory("npcs", story.npcs.filter((_, npcIndex) => npcIndex !== index))}
                    className="text-xs text-dark-500 hover:text-red-400 transition-colors"
                  >
                    삭제
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-dark-800 bg-dark-900/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-dark-200">NPC 사진 업로드</p>
                    <p className="mt-1 text-xs text-dark-500">
                      공개 인물 정보 패널에서 사용할 이미지를 바로 연결합니다.
                    </p>
                  </div>
                  <label className="shrink-0">
                    <input
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      onChange={(event) => handleNpcImageUpload(index, npc.id, event)}
                      disabled={isUploadingAsset(`npc:${npc.id}`)}
                    />
                    <span className="inline-flex items-center justify-center rounded-lg border border-dark-600 px-3 py-2 text-sm text-dark-200 hover:border-dark-400 transition-colors cursor-pointer">
                      {isUploadingAsset(`npc:${npc.id}`) ? "업로드 중…" : "이미지 업로드"}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="이름" required>
                    <input
                      type="text"
                      value={npc.name}
                      onChange={(e) => updateNpc(index, { name: e.target.value })}
                      placeholder="예: 집사 마거릿"
                      className={inp}
                    />
                  </Field>
                  <Field label="사진 URL">
                    <input
                      type="url"
                      value={npc.imageUrl ?? ""}
                      onChange={(e) => updateNpc(index, { imageUrl: e.target.value || undefined })}
                      placeholder="https://..."
                      className={inp}
                    />
                  </Field>
                </div>

                {npc.imageUrl ? (
                  <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40">
                    <img
                      src={npc.imageUrl}
                      alt={npc.name || `NPC ${index + 1} 사진 미리보기`}
                      className="h-48 w-full object-cover"
                    />
                    <div className="flex items-center justify-between gap-3 border-t border-dark-700 bg-dark-900/60 px-3 py-2">
                      <p className="truncate text-xs text-dark-500">{npc.imageUrl}</p>
                      <button
                        type="button"
                        onClick={() => updateNpc(index, { imageUrl: undefined })}
                        className="shrink-0 text-xs text-dark-500 hover:text-red-400 transition-colors"
                      >
                        이미지 제거
                      </button>
                    </div>
                  </div>
                ) : null}

                <Field label="배경">
                  <textarea
                    rows={3}
                    value={npc.background}
                    onChange={(e) => updateNpc(index, { background: e.target.value })}
                    placeholder="플레이어가 알 수 있는 공개 배경"
                    className={ta}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-dark-700 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">행동 타임라인</h3>
            <p className="mt-1 text-xs text-dark-500">
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
                    className="shrink-0 px-1 text-xs text-dark-500 hover:text-red-400 transition-colors"
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
                className="shrink-0 text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
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

      <div className="flex justify-end pt-2">
        <Button onClick={onSave} loading={saving} variant="secondary">
          저장
        </Button>
      </div>
    </div>
  );
}
