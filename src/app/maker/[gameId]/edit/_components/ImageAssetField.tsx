"use client";

import { useEffect, useId, useState, type ChangeEvent } from "react";
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
  emptyStateLabel = "아직 연결된 이미지가 없습니다.",
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

    const optimizedFile = await optimizeImageForUpload(file, profile);
    await onUpload(optimizedFile);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dark-800 bg-dark-900/40 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-dark-200">{title}</p>
            <p className="mt-1 text-xs text-dark-500">{description}</p>
          </div>
          <label htmlFor={fileInputId} className="shrink-0">
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
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span
            className={[
              "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] leading-none",
              hasValue
                ? "border-emerald-800 bg-emerald-950/20 text-emerald-300"
                : "border-dark-700 bg-dark-950/70 text-dark-400",
            ].join(" ")}
          >
            {hasValue ? "이미지 연결됨" : "이미지 미연결"}
          </span>
          {hasValue && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-500 transition-colors hover:border-red-900/50 hover:text-red-400"
            >
              이미지 제거
            </button>
          )}
        </div>

        {hasValue && (
          <button
            type="button"
            onClick={() => setShowPreview((current) => !current)}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dark-700 bg-dark-950/50 p-3 text-left transition-colors hover:border-dark-500 hover:bg-dark-950/70"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-dark-700 bg-dark-950">
              <img
                src={value}
                alt={alt}
                className={[
                  "h-full w-full",
                  profileConfig.previewImageClassName,
                ].join(" ")}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-dark-200">미리보기 이미지</p>
            </div>
            <span className="ml-auto shrink-0 text-xs text-mystery-300">
              {showPreview ? "접기" : "열기"}
            </span>
          </button>
        )}
      </div>

      {hasValue && showPreview ? (
        <div
          className={[
            "overflow-hidden rounded-xl border border-dark-700 bg-dark-950/40",
            profileConfig.previewAspectClassName,
          ].join(" ")}
        >
          <img
            src={value}
            alt={alt}
            className={[
              "h-full w-full",
              profileConfig.previewImageClassName,
            ].join(" ")}
          />
        </div>
      ) : !hasValue ? (
        <div className="rounded-xl border border-dashed border-dark-700 bg-gradient-to-br from-dark-900/90 via-dark-900 to-dark-950 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-dark-300">이미지 미연결</p>
              <p className="mt-1 text-xs leading-relaxed text-dark-600">{emptyStateLabel}</p>
            </div>
            <div className="shrink-0 space-y-1 text-right">
              <p className="text-[11px] text-dark-600">
                최대 {profileConfig.maxWidth}×{profileConfig.maxHeight}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
