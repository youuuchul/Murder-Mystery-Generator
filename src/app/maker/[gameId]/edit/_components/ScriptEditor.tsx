"use client";

import { useState } from "react";
import ImageAssetField from "./ImageAssetField";
import { useScrollAnchor } from "./useScrollAnchor";
import type { Location, RoundScript, Scripts } from "@/types/game";

interface ScriptEditorProps {
  gameId: string;
  scripts: Scripts;
  rounds: number;
  locations: Location[];
  onChange: (scripts: Scripts) => void;
}

const ta = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition resize-none text-sm";
const inp = "w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition text-sm";

/**
 * 라운드 카드 그룹 — Step 2 [미디어/이벤트] 탭 안 "라운드 이벤트" ToggleSection이 펼쳐졌을 때 노출.
 * 각 라운드는 enabled 토글로 입력 펼침/접힘. off면 게임 단위 기본 지도/BGM 사용.
 */
export default function ScriptEditor({
  gameId,
  scripts,
  rounds,
  locations: _locations,
  onChange,
}: ScriptEditorProps) {
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  void _locations;

  // 라운드 수에 맞춰 누락 라운드 채움 (메이커가 roundCount 변경 시 빈 RoundScript 자동 보충).
  const normalizedRounds: RoundScript[] = [];
  for (let r = 1; r <= rounds; r += 1) {
    normalizedRounds.push(
      scripts.rounds.find((item) => item.round === r) ?? {
        round: r,
        narration: "",
        unlockedLocationIds: [],
        enabled: false,
      },
    );
  }

  function updateRound(idx: number, patch: Partial<RoundScript>) {
    const next = normalizedRounds.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...scripts, rounds: next });
  }

  async function uploadRoundImage(roundNum: number, file: File) {
    setUploadingTarget(`round:${roundNum}`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scope", "story");
      const res = await fetch(`/api/games/${gameId}/assets`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "이미지 업로드 실패");
        return;
      }
      const idx = normalizedRounds.findIndex((r) => r.round === roundNum);
      if (idx >= 0) updateRound(idx, { imageUrl: data.url as string });
    } catch (error) {
      console.error("라운드 이미지 업로드 실패:", error);
      alert("이미지 업로드 중 오류");
    } finally {
      setUploadingTarget(null);
    }
  }

  return (
    <div className="space-y-2">
      {normalizedRounds.map((round, idx) => (
        <RoundCard
          key={round.round}
          round={round}
          uploadingImage={uploadingTarget === `round:${round.round}`}
          onChange={(patch) => updateRound(idx, patch)}
          onUploadImage={(file) => uploadRoundImage(round.round, file)}
        />
      ))}
    </div>
  );
}

function RoundCard({
  round,
  uploadingImage,
  onChange,
  onUploadImage,
}: {
  round: RoundScript;
  uploadingImage: boolean;
  onChange: (patch: Partial<RoundScript>) => void;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const captureScrollAnchor = useScrollAnchor();
  const enabled = round.enabled === true;

  return (
    <div className="rounded-xl border border-dark-700 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-dark-800/40">
        <p className="text-sm font-medium text-dark-100">Round {round.round}</p>
        <button
          type="button"
          onClick={(e) => { captureScrollAnchor(e); onChange({ enabled: !enabled }); }}
          aria-pressed={enabled}
          className="shrink-0"
        >
          <span
            className={[
              "relative block h-6 w-11 rounded-full transition-colors",
              enabled ? "bg-mystery-600" : "bg-dark-600",
            ].join(" ")}
          >
            <span
              className={[
                "absolute left-0 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                enabled ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </span>
        </button>
      </div>
      {enabled ? (
        <div className="border-t border-dark-700/60 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-dark-400 mb-1">이벤트 텍스트</label>
            <textarea
              rows={4}
              value={round.narration}
              onChange={(e) => onChange({ narration: e.target.value })}
              placeholder={`Round ${round.round}에 공통으로 띄울 안내`}
              className={ta}
            />
          </div>
          <ImageAssetField
            title="라운드 이미지"
            description=""
            value={round.imageUrl}
            alt={`Round ${round.round}`}
            profile="round"
            onChange={(next) => onChange({ imageUrl: next })}
            onUpload={onUploadImage}
            uploading={uploadingImage}
            uploadLabel="이미지 업로드"
            emptyStateLabel="이미지 없음"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">배경 음악 URL</label>
              <input
                type="url"
                value={round.backgroundMusic ?? ""}
                onChange={(e) => onChange({ backgroundMusic: e.target.value || undefined })}
                placeholder="https://..."
                className={inp}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1">영상 URL</label>
              <input
                type="url"
                value={round.videoUrl ?? ""}
                onChange={(e) => onChange({ videoUrl: e.target.value || undefined })}
                placeholder="https://..."
                className={inp}
              />
            </div>
          </div>
        </div>
      ) : (
        <p className="px-4 py-2 text-[11px] text-dark-500 border-t border-dark-700/40">기본 지도/BGM 사용</p>
      )}
    </div>
  );
}
