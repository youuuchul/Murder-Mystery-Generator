"use client";

import { useRef, useState, type ChangeEvent } from "react";
import ImageAssetField from "./ImageAssetField";
import ScriptEditor from "./ScriptEditor";
import { useScrollAnchor } from "./useScrollAnchor";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import { optimizeImageForUpload } from "./image-upload-processing";
import type {
  GamePackage,
  ScriptSegment,
  Story,
  StoryNpc,
} from "@/types/game";

interface Step2EditorProps {
  gameId: GamePackage["id"];
  story: Story;
  scripts: GamePackage["scripts"];
  rules: GamePackage["rules"];
  locations: GamePackage["locations"];
  onChangeStory: (story: Story) => void;
  onChangeScripts: (scripts: GamePackage["scripts"]) => void;
  onChangeRules: (rules: GamePackage["rules"]) => void;
}

type SubTab = "opening" | "characters" | "media";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "opening", label: "오프닝" },
  { id: "characters", label: "피해자/NPC" },
  { id: "media", label: "미디어/이벤트" },
];

const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";
const ta = `${inp} resize-none`;

function createNpc(): StoryNpc {
  return {
    id: crypto.randomUUID(),
    name: "",
    background: "",
    imageUrl: undefined,
  };
}

export default function Step2Editor({
  gameId,
  story,
  scripts,
  rules,
  locations,
  onChangeStory,
  onChangeScripts,
  onChangeRules,
}: Step2EditorProps) {
  const [tab, setTab] = useState<SubTab>("opening");
  const opening = scripts.opening;

  function updateStory<K extends keyof Story>(key: K, value: Story[K]) {
    onChangeStory({ ...story, [key]: value });
  }

  function updateOpening(patch: Partial<ScriptSegment>) {
    onChangeScripts({ ...scripts, opening: { ...opening, ...patch } });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-dark-800 p-1 rounded-lg">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "flex-1 py-2 px-3 rounded text-sm font-medium transition-colors",
              tab === t.id ? "bg-dark-600 text-dark-50" : "text-dark-500 hover:text-dark-300",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "opening" && (
        <OpeningSection opening={opening} onChange={updateOpening} />
      )}

      {tab === "characters" && (
        <CharactersSection
          gameId={gameId}
          story={story}
          onChangeStory={onChangeStory}
          updateStory={updateStory}
        />
      )}

      {tab === "media" && (
        <MediaEventsSection
          gameId={gameId}
          story={story}
          scripts={scripts}
          rules={rules}
          locations={locations}
          updateStory={updateStory}
          onChangeScripts={onChangeScripts}
          onChangeRules={onChangeRules}
        />
      )}
    </div>
  );
}

// ── 오프닝 ───────────────────────────────────────────────────────────────

function OpeningSection({
  opening,
  onChange,
}: {
  opening: ScriptSegment;
  onChange: (patch: Partial<ScriptSegment>) => void;
}) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-5 space-y-4">
      <div>
        <label className="block text-xs font-medium text-dark-400 mb-1">스토리 *</label>
        <textarea
          value={opening.narration}
          onChange={(e) => onChange({ narration: e.target.value })}
          placeholder="사건이 시작되는 분위기와 플레이어가 처음 받아야 할 인상"
          className={`${ta} min-h-[40vh]`}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">오프닝 영상 URL</label>
          <input
            type="url"
            value={opening.videoUrl ?? ""}
            onChange={(e) => onChange({ videoUrl: e.target.value || undefined })}
            placeholder="https://..."
            className={inp}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">오프닝 배경음악 URL</label>
          <input
            type="url"
            value={opening.backgroundMusic ?? ""}
            onChange={(e) => onChange({ backgroundMusic: e.target.value || undefined })}
            placeholder="https://..."
            className={inp}
          />
        </div>
      </div>
    </div>
  );
}

// ── 피해자 / NPC ─────────────────────────────────────────────────────────

function CharactersSection({
  gameId,
  story,
  onChangeStory,
  updateStory,
}: {
  gameId: string;
  story: Story;
  onChangeStory: (story: Story) => void;
  updateStory: <K extends keyof Story>(key: K, value: Story[K]) => void;
}) {
  const captureScrollAnchor = useScrollAnchor();

  return (
    <div className="space-y-4">
      <CharacterPersonCard
        gameId={gameId}
        title="피해자"
        name={story.victim.name}
        background={story.victim.background}
        imageUrl={story.victim.imageUrl}
        scope="story"
        onChangeName={(name) => onChangeStory({ ...story, victim: { ...story.victim, name } })}
        onChangeBackground={(background) => onChangeStory({ ...story, victim: { ...story.victim, background } })}
        onChangeImage={(imageUrl) => onChangeStory({ ...story, victim: { ...story.victim, imageUrl } })}
      />

      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-dark-100">NPC</p>
          <button
            type="button"
            onClick={(e) => { captureScrollAnchor(e); updateStory("npcs", [...story.npcs, createNpc()]); }}
            className="text-xs text-mystery-400 hover:text-mystery-300 transition-colors"
          >
            + NPC 추가
          </button>
        </div>
        {story.npcs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-700 px-4 py-5">
            <p className="text-xs text-dark-600">등록된 NPC가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {story.npcs.map((npc, index) => (
              <CharacterPersonCard
                key={npc.id}
                gameId={gameId}
                title={`NPC ${index + 1}`}
                name={npc.name}
                background={npc.background}
                imageUrl={npc.imageUrl}
                scope="story"
                onChangeName={(name) => updateStory("npcs", story.npcs.map((n, i) => (i === index ? { ...n, name } : n)))}
                onChangeBackground={(background) => updateStory("npcs", story.npcs.map((n, i) => (i === index ? { ...n, background } : n)))}
                onChangeImage={(imageUrl) => updateStory("npcs", story.npcs.map((n, i) => (i === index ? { ...n, imageUrl } : n)))}
                onDelete={() => updateStory("npcs", story.npcs.filter((_, i) => i !== index))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 피해자/NPC 공용 카드 — PlayerEditor 캐릭터 카드와 동일 grid 폼.
 * 좌측: 큰 사각형 이미지 thumbnail + 클릭 시 모달 크게 보기.
 * 우측: 이름 + 배경.
 */
function CharacterPersonCard({
  gameId,
  title,
  name,
  background,
  imageUrl,
  scope,
  onChangeName,
  onChangeBackground,
  onChangeImage,
  onDelete,
}: {
  gameId: string;
  title: string;
  name: string;
  background: string;
  imageUrl?: string;
  scope: "story";
  onChangeName: (next: string) => void;
  onChangeBackground: (next: string) => void;
  onChangeImage: (next?: string) => void;
  onDelete?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputId = useRef(`person-image-${crypto.randomUUID()}`).current;
  const captureScrollAnchor = useScrollAnchor();

  async function uploadImage(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", scope);
    setUploading(true);
    try {
      const res = await fetch(`/api/games/${gameId}/assets`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "이미지 업로드 실패");
        return;
      }
      onChangeImage(data.url as string);
    } catch (error) {
      console.error("이미지 업로드 실패:", error);
      alert("이미지 업로드 중 오류");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-dark-100">{title}</p>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { captureScrollAnchor(e); onDelete(); }}
              className="text-xs text-dark-500 hover:text-red-400 transition-colors"
            >
              삭제
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
          <div className="space-y-1.5">
            {(imageUrl ?? "").trim() ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="block aspect-square w-full overflow-hidden rounded-xl border border-dark-700 bg-dark-950 transition-colors hover:border-dark-500"
              >
                <img
                  src={withGameAssetVariant(imageUrl, "display") ?? imageUrl}
                  alt={name || title}
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
                htmlFor={inputId}
                className={`flex-1 cursor-pointer rounded-md border border-dark-600 px-2 py-1 text-center text-[11px] text-dark-300 transition-colors hover:border-dark-400 ${uploading ? "opacity-60 pointer-events-none" : ""}`}
              >
                <input
                  id={inputId}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const optimized = await optimizeImageForUpload(file, "portrait");
                      await uploadImage(optimized.file);
                    } catch (error) {
                      console.error("이미지 준비 실패:", error);
                      alert(error instanceof Error ? error.message : "이미지 준비 실패");
                    }
                  }}
                />
                {uploading ? "업로드중…" : "업로드"}
              </label>
              {(imageUrl ?? "").trim() && (
                <button
                  type="button"
                  onClick={() => onChangeImage(undefined)}
                  className="rounded-md border border-dark-700 px-2 py-1 text-[11px] text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
                >
                  제거
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">이름 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => onChangeName(e.target.value)}
                placeholder="이름"
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">배경</label>
              <textarea
                rows={5}
                value={background}
                onChange={(e) => onChangeBackground(e.target.value)}
                placeholder="플레이어가 알 수 있는 공개 배경"
                className={ta}
              />
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (imageUrl ?? "").trim() && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
        >
          <img
            src={withGameAssetVariant(imageUrl, "display") ?? imageUrl}
            alt={name || title}
            className="pointer-events-none max-h-[90vh] max-w-[90vw] object-contain"
          />
        </div>
      )}
    </>
  );
}

// ── 미디어 / 이벤트 ──────────────────────────────────────────────────────

function MediaEventsSection({
  gameId,
  story,
  scripts,
  rules,
  locations,
  updateStory,
  onChangeScripts,
  onChangeRules,
}: {
  gameId: string;
  story: Story;
  scripts: GamePackage["scripts"];
  rules: GamePackage["rules"];
  locations: GamePackage["locations"];
  updateStory: <K extends keyof Story>(key: K, value: Story[K]) => void;
  onChangeScripts: (scripts: GamePackage["scripts"]) => void;
  onChangeRules: (rules: GamePackage["rules"]) => void;
}) {
  const captureScrollAnchor = useScrollAnchor();
  const useLobbyScript = rules.useLobbyScript === true;
  const useRoundEvents = rules.useRoundEvents === true;
  const lobby = scripts.lobby;

  async function handleMapImageUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "story");
    const res = await fetch(`/api/games/${gameId}/assets`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "지도 이미지 업로드 실패");
      return;
    }
    updateStory("mapImageUrl", data.url as string);
  }

  return (
    <div className="space-y-4">
      {/* 게임 단위 기본값 */}
      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-4 space-y-3">
        <p className="text-sm font-semibold text-dark-100">게임 기본값</p>
        <p className="text-xs text-dark-500">라운드 이벤트가 꺼진 라운드는 이 값을 사용합니다.</p>
        <ImageAssetField
          title="대표 지도"
          description=""
          value={story.mapImageUrl}
          alt="대표 지도"
          profile="map"
          onChange={(nextValue) => updateStory("mapImageUrl", nextValue)}
          onUpload={handleMapImageUpload}
          uploading={false}
          uploadLabel="이미지 업로드"
          emptyStateLabel="이미지 없음"
        />
        <div>
          <label className="block text-xs font-medium text-dark-400 mb-1">대표 BGM URL</label>
          <input
            type="url"
            value={story.defaultBackgroundMusic ?? ""}
            onChange={(e) => updateStory("defaultBackgroundMusic", e.target.value || undefined)}
            placeholder="https://..."
            className={inp}
          />
        </div>
      </div>

      {/* 대기실 */}
      <ToggleSection
        label="대기실"
        on={useLobbyScript}
        onToggle={(next) => {
          captureScrollAnchor(document.activeElement as HTMLElement | null);
          onChangeRules({ ...rules, useLobbyScript: next });
        }}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">안내 텍스트</label>
            <textarea
              rows={4}
              value={lobby.narration}
              onChange={(e) => onChangeScripts({ ...scripts, lobby: { ...lobby, narration: e.target.value } })}
              placeholder="플레이어가 모이는 대기실에 띄울 안내"
              className={ta}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">대기실 BGM URL</label>
            <input
              type="url"
              value={lobby.backgroundMusic ?? ""}
              onChange={(e) => onChangeScripts({ ...scripts, lobby: { ...lobby, backgroundMusic: e.target.value || undefined } })}
              placeholder="https://..."
              className={inp}
            />
          </div>
        </div>
      </ToggleSection>

      {/* 라운드 이벤트 */}
      <ToggleSection
        label="라운드 이벤트"
        on={useRoundEvents}
        onToggle={(next) => {
          captureScrollAnchor(document.activeElement as HTMLElement | null);
          onChangeRules({ ...rules, useRoundEvents: next });
        }}
      >
        <ScriptEditor
          gameId={gameId}
          scripts={scripts}
          rounds={rules.roundCount ?? 4}
          locations={locations}
          onChange={onChangeScripts}
        />
      </ToggleSection>
    </div>
  );
}

/** on/off 토글 + on일 때 자식 펼침. */
function ToggleSection({
  label,
  on,
  onToggle,
  children,
}: {
  label: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/40">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-dark-100">{label}</p>
        <button
          type="button"
          onClick={() => onToggle(!on)}
          aria-pressed={on}
          className="shrink-0"
        >
          <span
            className={[
              "relative block h-6 w-11 rounded-full transition-colors",
              on ? "bg-mystery-600" : "bg-dark-600",
            ].join(" ")}
          >
            <span
              className={[
                "absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                on ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </span>
        </button>
      </div>
      {on && (
        <div className="border-t border-dark-700/60 p-4">
          {children}
        </div>
      )}
    </div>
  );
}
