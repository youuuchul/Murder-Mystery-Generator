"use client";

import { useEffect, useId, useState, type ChangeEvent } from "react";
import { withGameAssetVariant } from "@/lib/game-asset-variant";
import { optimizeImageForUpload, type OptimizedImageUploadReport } from "./image-upload-processing";
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

/** 바이트 단위를 사람이 읽기 쉬운 KB/MB 표기로 바꾼다. */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${bytes}B`;
}

/**
 * 업로드 직전 최적화 결과를 짧은 한 줄 설명으로 바꾼다.
 * 사용자가 실제로 얼마나 줄었는지 확인할 수 있게 한다.
 */
function buildOptimizationSummary(report: OptimizedImageUploadReport): string {
  const originalSize = formatFileSize(report.originalBytes);
  const outputSize = formatFileSize(report.outputBytes);
  const outputFormatLabel = report.outputMimeType === "image/webp" ? " WEBP" : "";

  if (!report.transformed) {
    return `업로드 준비 완료: ${report.outputWidth}×${report.outputHeight} · ${outputSize}${outputFormatLabel}`;
  }

  return `업로드 전 최적화: ${report.originalWidth}×${report.originalHeight} · ${originalSize} → ${report.outputWidth}×${report.outputHeight} · ${outputSize}${outputFormatLabel}`;
}

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
  const [optimizationSummary, setOptimizationSummary] = useState<string | null>(null);
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
      const summary = buildOptimizationSummary(optimized.report);
      setOptimizationSummary(
        optimized.report.note ? `${summary} · ${optimized.report.note}` : summary
      );
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
          <span className="inline-flex items-center justify-center rounded-full border border-dark-700 bg-dark-950/70 px-2.5 py-1 text-[11px] leading-none text-dark-300">
            {profileConfig.recommendedRatioLabel}
          </span>
          <span className="inline-flex items-center justify-center rounded-full border border-dark-700 bg-dark-950/70 px-2.5 py-1 text-[11px] leading-none text-dark-300">
            {profileConfig.recommendedDimensionsLabel}
          </span>
          <span className="inline-flex items-center justify-center rounded-full border border-dark-700 bg-dark-950/70 px-2.5 py-1 text-[11px] leading-none text-dark-300">
            {profileConfig.outputHintLabel}
          </span>
          <span
            className={[
              "inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-[11px] leading-none",
              hasValue
                ? "border-sage-700 bg-sage-900/25 text-sage-300"
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

        {profileConfig.cropHint ? (
          <p className="mt-3 text-xs leading-relaxed text-dark-500">{profileConfig.cropHint}</p>
        ) : null}

        {optimizationSummary ? (
          <div className="mt-3 rounded-lg border border-sage-900/60 bg-sage-950/20 px-3 py-2 text-xs leading-relaxed text-sage-200">
            {optimizationSummary}
          </div>
        ) : null}

        {hasValue && (
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
            src={withGameAssetVariant(value, "display") ?? value}
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
