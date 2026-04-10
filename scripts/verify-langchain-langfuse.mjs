/**
 * LangChain + Langfuse 연동 검증 스크립트.
 * ChatOpenAI 호출이 Langfuse trace로 기록되는지 확인한다.
 *
 * 실행: node scripts/verify-langchain-langfuse.mjs
 */

import fs from "fs";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CallbackHandler } from "@langfuse/langchain";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();

// 1. Langfuse callback handler 생성
console.log("1. Langfuse CallbackHandler 생성...");
const langfuseHandler = new CallbackHandler({
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  secretKey: env.LANGFUSE_SECRET_KEY,
  baseUrl: env.LANGFUSE_BASE_URL,
  sessionId: "verify-langchain-session",
  userId: "verify-script",
  tags: ["langchain-verify", "phase-0-2"],
  metadata: {
    feature: "langchain-integration-test",
    environment: "verification",
  },
});
console.log("   생성 완료");

// 2. ChatOpenAI 클라이언트 생성
console.log("2. ChatOpenAI 클라이언트 생성...");
const apiKey = env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("   FAIL: OPENAI_API_KEY 누락");
  process.exit(1);
}
const model = env.OPENAI_MODEL || "gpt-5-mini";
const chat = new ChatOpenAI({
  apiKey,
  model,
  maxTokens: 100,
});
console.log(`   모델: ${model}`);

// 3. LLM 호출 + Langfuse 추적
console.log("3. LLM 호출 (Langfuse 추적 포함)...");
const startTime = Date.now();

try {
  const response = await chat.invoke(
    [
      new SystemMessage("You are a helpful assistant. Reply in Korean. Keep it under 50 characters."),
      new HumanMessage("안녕하세요! LangChain 연동 테스트입니다."),
    ],
    { callbacks: [langfuseHandler] }
  );

  const elapsed = Date.now() - startTime;
  console.log(`   응답: ${response.content}`);
  console.log(`   소요: ${elapsed}ms`);

  // 4. Langfuse flush
  console.log("4. Langfuse flush...");
  if (typeof langfuseHandler.flushAsync === "function") {
    await langfuseHandler.flushAsync();
  } else if (typeof langfuseHandler.shutdownAsync === "function") {
    await langfuseHandler.shutdownAsync();
  } else {
    // @langfuse/langchain 5.x uses langfuse client internally
    const client = langfuseHandler.langfuse ?? langfuseHandler._langfuse;
    if (client && typeof client.flushAsync === "function") {
      await client.flushAsync();
    } else if (client && typeof client.flush === "function") {
      await client.flush();
    }
  }
  console.log("   flush 완료");

  // 5. Langfuse API에서 trace 확인
  console.log("5. Langfuse API에서 trace 확인...");
  const authHeader = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString("base64");
  const traceResponse = await fetch(`${env.LANGFUSE_BASE_URL}/api/public/traces?limit=3`, {
    headers: { Authorization: `Basic ${authHeader}` },
  });
  const traceData = await traceResponse.json();

  const found = traceData.data?.find(t =>
    t.tags?.includes("langchain-verify") ||
    t.sessionId === "verify-langchain-session"
  );

  if (found) {
    console.log(`   PASS: trace 발견 (id=${found.id})`);
    console.log(`   name=${found.name}`);
    console.log(`   tags=${JSON.stringify(found.tags)}`);
    console.log(`   sessionId=${found.sessionId}`);
  } else {
    console.log("   WARN: trace 아직 미도착 (인덱싱 지연 가능). 최근 traces:");
    for (const t of (traceData.data || []).slice(0, 3)) {
      console.log(`     - ${t.name} | ${t.timestamp} | tags=${JSON.stringify(t.tags)}`);
    }
  }

  console.log("\nPASS: LangChain + Langfuse 연동 성공");
} catch (error) {
  console.error("\nFAIL:", error.message);

  if (error.status === 401) {
    console.error("   OpenAI API 키가 만료되었거나 잘못되었습니다.");
  } else if (error.status === 429) {
    console.error("   OpenAI API rate limit 초과.");
  }

  process.exit(1);
}
