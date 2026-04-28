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
 * 변환 결과가 원본보다 커지면 원본을 유지해 "최적화"가 역효과를 내지 않게 한다.
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
  let bestBlob: Blob | null = null;

  for (const quality of qualitySteps) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob) {
      continue;
    }

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (blob.size <= config.targetBytes) {
      break;
    }
  }

  if (bestBlob && shouldUseOptimizedBlob(file, image, targetWidth, targetHeight, bestBlob)) {
    const optimizedFile = new File(
      [bestBlob],
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
        outputBytes: bestBlob.size,
        outputMimeType: "image/webp",
        transformed:
          bestBlob.size !== file.size
          || targetWidth !== image.naturalWidth
          || targetHeight !== image.naturalHeight
          || file.type !== "image/webp",
      },
    };
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
      note: bestBlob && bestBlob.size > file.size
        ? "변환본이 더 커서 원본을 유지합니다."
        : undefined,
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

/** 원본보다 커지는 변환은 버리고, 실제 바이트 절감 또는 리사이즈가 있는 경우만 채택한다. */
function shouldUseOptimizedBlob(
  file: File,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  blob: Blob
): boolean {
  const resized = targetWidth !== image.naturalWidth || targetHeight !== image.naturalHeight;
  const smaller = blob.size < file.size;

  if (blob.size > file.size) {
    return false;
  }

  return resized || smaller || file.type !== "image/webp";
}

/** 최적화 출력이 webp가 되므로 파일명 확장자도 함께 바꾼다. */
function replaceFileExtension(filename: string, extension: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const stem = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  return `${stem}.${extension}`;
}
