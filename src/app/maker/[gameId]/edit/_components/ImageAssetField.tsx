"use client";

import { useId, useState, type ChangeEvent } from "react";
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
  urlLabel?: string;
  urlHint?: string;
  urlPlaceholder?: string;
}

const FILE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const inputClass = "w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2.5 text-dark-100 placeholder:text-dark-600 focus:outline-none focus:ring-2 focus:ring-mystery-500 focus:border-transparent transition";

/**
 * 업로드 기반 이미지 필드.
 * 기본 CTA는 파일 업로드로 두고, 외부 URL 입력은 필요할 때만 펼쳐서 보여준다.
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
  urlLabel = "외부 이미지 URL",
  urlHint,
  urlPlaceholder = "https://...",
}: ImageAssetFieldProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputId = useId();
  const hasValue = Boolean(value?.trim());
  const profileConfig = getImageAssetProfileConfig(profile);

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
          <button
            type="button"
            onClick={() => setShowUrlInput((current) => !current)}
            className="rounded-lg border border-dark-700 px-3 py-2 text-xs text-dark-400 transition-colors hover:border-dark-500 hover:text-dark-200"
          >
            {showUrlInput ? "URL 입력 닫기" : hasValue ? "외부 URL 수정" : "외부 URL 직접 입력"}
          </button>
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

        {showUrlInput && (
          <div className="mt-3 rounded-xl border border-dark-700 bg-dark-950/40 p-3">
            <label className="mb-1 block text-sm font-medium text-dark-200">{urlLabel}</label>
            {urlHint && <p className="mb-2 text-xs text-dark-500">{urlHint}</p>}
            <input
              type="url"
              value={value ?? ""}
              onChange={(event) => onChange(event.target.value || undefined)}
              placeholder={urlPlaceholder}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {hasValue ? (
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
      ) : (
        <div className="rounded-xl border border-dashed border-dark-700 bg-gradient-to-br from-dark-900/90 via-dark-900 to-dark-950 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-dark-300">이미지 미연결</p>
              <p className="mt-1 text-xs leading-relaxed text-dark-600">{emptyStateLabel}</p>
            </div>
            <div className="shrink-0 space-y-1 text-right">
              <span className="inline-flex rounded-full border border-dark-700 bg-dark-950/70 px-2.5 py-1 text-[11px] text-dark-400">
                {profileConfig.recommendedRatioLabel}
              </span>
              <p className="text-[11px] text-dark-600">
                최대 {profileConfig.maxWidth}×{profileConfig.maxHeight}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
