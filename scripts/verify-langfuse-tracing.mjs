/**
 * Langfuse 트레이싱 동작 검증 스크립트.
 * OTel SDK + LangfuseSpanProcessor 가 실제로 trace 를 전송하는지 확인한다.
 *
 * 실행: node scripts/verify-langfuse-tracing.mjs
 */

import fs from "fs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation, updateActiveObservation } from "@langfuse/tracing";

// .env 파싱
function loadEnv() {
  const env = {};
  const raw = fs.readFileSync(".env", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnv();

const publicKey = env.LANGFUSE_PUBLIC_KEY;
const secretKey = env.LANGFUSE_SECRET_KEY;
const baseUrl = env.LANGFUSE_BASE_URL;

if (!publicKey || !secretKey || !baseUrl) {
  console.error("Langfuse 환경변수 누락. LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL 필요.");
  process.exit(1);
}

console.log("1. OTel SDK + Langfuse 초기화...");

const sdk = new NodeSDK({
  spanProcessors: [
    new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl,
      environment: "verification-test",
      release: "verify-script",
      exportMode: "immediate",
    }),
  ],
});

await Promise.resolve(sdk.start());
console.log("   SDK 시작 완료");

console.log("2. startActiveObservation으로 trace 생성...");

await startActiveObservation("verify.langfuse-tracing.phase0", async () => {
  updateActiveObservation({
    input: {
      source: "verify-script",
      purpose: "Phase 0-1: Langfuse 동작 검증",
      timestamp: new Date().toISOString(),
    },
    output: {
      status: "ok",
      message: "트레이싱 정상 동작 확인",
    },
    metadata: {
      feature: "langfuse-verification",
      phase: "0-1",
    },
  });
});

console.log("   trace 생성 완료");

console.log("3. SDK 종료 (flush)...");
await sdk.shutdown();
console.log("   flush 완료");

// Langfuse API로 trace 확인 (약간 대기 후)
console.log("4. Langfuse API에서 trace 확인 (2초 대기)...");
await new Promise(resolve => setTimeout(resolve, 2000));

const authHeader = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
const response = await fetch(`${baseUrl}/api/public/traces?limit=5`, {
  headers: { Authorization: `Basic ${authHeader}` },
});
const data = await response.json();

const verifyTrace = data.data?.find(t => t.name === "verify.langfuse-tracing.phase0");
if (verifyTrace) {
  console.log(`   PASS: trace 발견 (id=${verifyTrace.id}, timestamp=${verifyTrace.timestamp})`);
} else {
  console.log("   FAIL: trace 미발견. 최근 trace 목록:");
  for (const t of data.data || []) {
    console.log(`     - ${t.name} | ${t.timestamp}`);
  }
}
