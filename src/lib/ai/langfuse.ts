import "server-only";

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

type LangfuseRuntimeConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  environment: string;
  release?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __murderMysteryLangfuseStartPromise: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __murderMysteryLangfuseSdk: NodeSDK | undefined;
}

/**
 * Langfuse 필수 자격 증명이 모두 있는지 확인하고, tracing exporter 설정값을 정리한다.
 * 값이 하나라도 비어 있으면 기능 전체를 조용히 비활성화한다.
 */
function getLangfuseRuntimeConfig(): LangfuseRuntimeConfig | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim();

  if (!publicKey || !secretKey || !baseUrl) {
    return null;
  }

  return {
    publicKey,
    secretKey,
    baseUrl,
    environment:
      process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() ||
      process.env.VERCEL_ENV?.trim() ||
      process.env.NODE_ENV?.trim() ||
      "development",
    release:
      process.env.LANGFUSE_RELEASE?.trim() ||
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      undefined,
  };
}

/** Langfuse tracing 이 실제로 켜질 수 있는 최소 env 조합이 있는지 반환한다. */
export function isLangfuseTracingEnabled(): boolean {
  return getLangfuseRuntimeConfig() !== null;
}

/**
 * OpenTelemetry -> Langfuse exporter 를 한 번만 시작한다.
 * Vercel 서버리스 환경에서도 span 유실을 줄이기 위해 immediate export 를 사용한다.
 */
export async function startLangfuseTracing(): Promise<boolean> {
  const config = getLangfuseRuntimeConfig();

  if (!config) {
    return false;
  }

  if (!globalThis.__murderMysteryLangfuseStartPromise) {
    globalThis.__murderMysteryLangfuseStartPromise = Promise.resolve().then(async () => {
      const sdk = new NodeSDK({
        spanProcessors: [
          new LangfuseSpanProcessor({
            publicKey: config.publicKey,
            secretKey: config.secretKey,
            baseUrl: config.baseUrl,
            environment: config.environment,
            release: config.release,
            exportMode: "immediate",
            mask: ({ data }) => maskLangfuseData(data),
          }),
        ],
      });

      await Promise.resolve(sdk.start());
      globalThis.__murderMysteryLangfuseSdk = sdk;
      return true;
    }).catch((error) => {
      console.error("[langfuse] tracing bootstrap failed", error);
      globalThis.__murderMysteryLangfuseStartPromise = undefined;
      return false;
    });
  }

  return globalThis.__murderMysteryLangfuseStartPromise;
}

/**
 * 요청 처리 중에 tracing 초기화가 아직 안 된 경우를 대비한 보조 호출이다.
 * 초기화 실패가 앱 동작을 막지 않도록 fire-and-forget 으로만 사용한다.
 */
export function warmLangfuseTracing(): void {
  void startLangfuseTracing();
}

/** 짧게 실행되는 검증 스크립트나 종료 직전 라우트에서 강제 flush 가 필요할 때 사용한다. */
export async function flushLangfuseTracing(): Promise<void> {
  await globalThis.__murderMysteryLangfuseStartPromise;
  await globalThis.__murderMysteryLangfuseSdk?.shutdown();
}

/** SDK를 종료하지 않고 현재 대기 중인 span만 강제 전송한다. 서버리스 응답 직전에 사용. */
export async function forceFlushLangfuseTracing(): Promise<void> {
  await globalThis.__murderMysteryLangfuseStartPromise;
  // NodeSDK의 내부 span processor에 flush 요청
  const sdk = globalThis.__murderMysteryLangfuseSdk;
  if (sdk && typeof (sdk as unknown as { _tracerProvider?: { forceFlush?: () => Promise<void> } })._tracerProvider?.forceFlush === "function") {
    await (sdk as unknown as { _tracerProvider: { forceFlush: () => Promise<void> } })._tracerProvider.forceFlush();
  }
}

/**
 * trace 에 남길 문자열에서 이메일과 주요 API 키 패턴을 가린다.
 * 메이커 도우미 프롬프트 디버깅 가치는 유지하면서 계정 정보 누출만 줄인다.
 */
function maskSensitiveString(value: string): string {
  return value
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted-email]"
    )
    .replace(/\bsk-lf-[A-Za-z0-9-]+\b/g, "[redacted-langfuse-secret]")
    .replace(/\bpk-lf-[A-Za-z0-9-]+\b/g, "[redacted-langfuse-public]")
    .replace(/\bsk-proj-[A-Za-z0-9_-]+\b/g, "[redacted-openai-key]")
    .replace(/\bsb_secret_[A-Za-z0-9._-]+\b/g, "[redacted-supabase-secret]");
}

/**
 * Langfuse exporter 직전에 span payload 를 순회하며 문자열 기반 민감 정보를 마스킹한다.
 * 객체 구조는 유지해 두어 trace 탐색성과 디버깅 가독성은 남긴다.
 */
function maskLangfuseData(value: unknown): unknown {
  if (typeof value === "string") {
    return maskSensitiveString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskLangfuseData(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, maskLangfuseData(nestedValue)])
    );
  }

  return value;
}
