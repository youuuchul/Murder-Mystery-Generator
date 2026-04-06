"use client";

import { getImageAssetProfileConfig, type ImageAssetProfile } from "./image-upload-profiles";

export interface OptimizedImageUploadReport {
  originalWidth: number;
  originalHeight: number;
  outputWidth: number;
  outputHeight: number;
  originalBytes: number;
  outputBytes: number;
  outputMimeType: string;
  transformed: boolean;
  note?: string;
}

export interface OptimizedImageUploadResult {
  file: File;
  report: OptimizedImageUploadReport;
}

/**
 * 업로드 직전 이미지를 용도별 최대 크기에 맞춰 축소/압축한다.
 * 현재는 원본 보존보다 편집 UX와 디스크 사용량 절감을 우선해 브라우저에서 1차 최적화를 수행한다.
 */
export async function optimizeImageForUpload(
  file: File,
  profile: ImageAssetProfile
): Promise<OptimizedImageUploadResult> {
  if (!file.type.startsWith("image/")) {
    return {
      file,
      report: {
        originalWidth: 0,
        originalHeight: 0,
        outputWidth: 0,
        outputHeight: 0,
        originalBytes: file.size,
        outputBytes: file.size,
        outputMimeType: file.type || "application/octet-stream",
        transformed: false,
      },
    };
  }

  // 애니메이션 GIF는 캔버스로 다시 인코딩하면 깨지므로 그대로 유지한다.
  if (file.type === "image/gif") {
    const image = await loadImageElement(file);
    return {
      file,
      report: {
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        outputWidth: image.naturalWidth,
        outputHeight: image.naturalHeight,
        originalBytes: file.size,
        outputBytes: file.size,
        outputMimeType: file.type,
        transformed: false,
        note: "애니메이션 GIF는 원본을 유지합니다.",
      },
    };
  }

  const config = getImageAssetProfileConfig(profile);
  const image = await loadImageElement(file);
  const scale = Math.min(1, config.maxWidth / image.naturalWidth, config.maxHeight / image.naturalHeight);
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  if (
    scale === 1
    && file.size <= config.targetBytes
    && (file.type === "image/webp" || file.type === "image/jpeg")
  ) {
    return {
      file,
      report: {
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        outputWidth: image.naturalWidth,
        outputHeight: image.naturalHeight,
        originalBytes: file.size,
        outputBytes: file.size,
        outputMimeType: file.type,
        transformed: false,
      },
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return {
      file,
      report: {
        originalWidth: image.naturalWidth,
        originalHeight: image.naturalHeight,
        outputWidth: image.naturalWidth,
        outputHeight: image.naturalHeight,
        originalBytes: file.size,
        outputBytes: file.size,
        outputMimeType: file.type,
        transformed: false,
      },
    };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const qualitySteps = buildQualitySteps(config.initialQuality, config.minQuality);

  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob) {
      continue;
    }

    if (blob.size <= config.targetBytes || quality === qualitySteps[qualitySteps.length - 1]) {
      const optimizedFile = new File(
        [blob],
        replaceFileExtension(file.name, "webp"),
        { type: "image/webp", lastModified: Date.now() }
      );

      return {
        file: optimizedFile,
        report: {
          originalWidth: image.naturalWidth,
          originalHeight: image.naturalHeight,
          outputWidth: targetWidth,
          outputHeight: targetHeight,
          originalBytes: file.size,
          outputBytes: blob.size,
          outputMimeType: "image/webp",
          transformed:
            blob.size !== file.size
            || targetWidth !== image.naturalWidth
            || targetHeight !== image.naturalHeight
            || file.type !== "image/webp",
        },
      };
    }
  }

  return {
    file,
    report: {
      originalWidth: image.naturalWidth,
      originalHeight: image.naturalHeight,
      outputWidth: image.naturalWidth,
      outputHeight: image.naturalHeight,
      originalBytes: file.size,
      outputBytes: file.size,
      outputMimeType: file.type,
      transformed: false,
    },
  };
}

/** 파일을 브라우저 Image 객체로 읽어 natural width/height를 확인한다. */
async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지 파일을 읽지 못했습니다."));
    };

    image.src = objectUrl;
  });
}

/** canvas를 지정 포맷과 품질로 Blob으로 인코딩한다. */
async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/** 초기 품질부터 최소 품질까지 몇 단계로 낮춰 가며 압축을 시도한다. */
function buildQualitySteps(initialQuality: number, minQuality: number): number[] {
  const steps = [initialQuality];
  const decrement = 0.08;
  let current = initialQuality - decrement;

  while (current > minQuality) {
    steps.push(Number(current.toFixed(2)));
    current -= decrement;
  }

  steps.push(minQuality);
  return Array.from(new Set(steps));
}

/** 최적화 출력이 webp가 되므로 파일명 확장자도 함께 바꾼다. */
function replaceFileExtension(filename: string, extension: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  return `${stem}.${extension}`;
}
