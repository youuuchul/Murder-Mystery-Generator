"use client";

import { useEffect, useId, useState, type ChangeEvent } from "react";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import { optimizeImageForUpload } from "./image-upload-processing";
import { getImageAssetProfileConfig, type ImageAssetProfile } from "./image-upload-profiles";

interface ImageAssetFieldProps {
  title: string;
  description: string;
  value?: string;
  alt: string;
  profile: ImageAssetProfile;
  onChange: (nextValue?: string) => void;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  uploadLabel?: string;
  emptyStateLabel?: string;
}

const FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/**
 * 업로드 기반 이미지 필드.
 * 연결 상태는 작은 썸네일 요약으로 먼저 보여주고, 큰 미리보기는 필요할 때만 펼친다.
 */
export default function ImageAssetField({
  title,
  description,
  value,
  alt,
  profile,
  onChange,
  onUpload,
  uploading = false,
  uploadLabel = "이미지 업로드",
  emptyStateLabel = "이미지 없음",
}: ImageAssetFieldProps) {
  const [showPreview, setShowPreview] = useState(false);
  const fileInputId = useId();
  const hasValue = Boolean(value?.trim());
  const profileConfig = getImageAssetProfileConfig(profile);

  useEffect(() => {
    if (!hasValue) {
      setShowPreview(false);
    }
  }, [hasValue]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const optimized = await optimizeImageForUpload(file, profile);
      await onUpload(optimized.file);
    } catch (error) {
      console.error("이미지 준비 실패:", error);
      alert(error instanceof Error ? error.message : "이미지 준비 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dark-800 bg-dark-900/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-dark-200">{title}</p>
            {description ? <p className="mt-1 text-xs text-dark-500">{description}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label htmlFor={fileInputId}>
              <input
                id={fileInputId}
                type="file"
                accept={FILE_ACCEPT}
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <span className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-dark-600 px-3 py-2 text-sm text-dark-200 transition-colors hover:border-dark-400">
                {uploading ? "업로드 중…" : uploadLabel}
              </span>
            </label>
            {hasValue ? (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
              >
                제거
              </button>
            ) : null}
          </div>
        </div>

        {!hasValue ? (
          <p className="mt-3 text-xs text-dark-600">{emptyStateLabel}</p>
        ) : null}

        {hasValue ? (
          <button
            type="button"
            onClick={() => setShowPreview((current) => !current)}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dark-700 bg-dark-950/50 p-3 text-left transition-colors hover:border-dark-500 hover:bg-dark-950/70"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-dark-700 bg-dark-950">
              <img
                src={withGameAssetVariant(value, "thumb") ?? value}
                alt={alt}
                className={[
                  "h-full w-full",
                  profileConfig.previewImageClassName,
                ].join(" ")}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-dark-200">미리보기</p>
            </div>
            <span className="ml-auto shrink-0 text-xs text-mystery-300">
              {showPreview ? "접기" : "열기"}
            </span>
          </button>
        ) : null}
      </div>

      {hasValue && showPreview ? (
        <div
          className={[
            "overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40",
            profileConfig.previewAspectClassName,
          ].join(" ")}
        >
          <img
            src={withGameAssetVariant(value, "display") ?? value}
            alt={alt}
            className={[
              "h-full w-full",
              profileConfig.previewImageClassName,
            ].join(" ")}
          />
        </div>
      ) : null}
    </div>
  );
}
