/**
 * Cloudflare 임시 터널 실행 스크립트
 * - cloudflared 실행 후 URL을 .tunnel-url 파일에 저장
 * - server-info API가 이 파일을 읽어 GM 화면에 표시
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const URL_FILE = join(process.cwd(), ".tunnel-url");
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const MAX_PORT_SCAN = 10;
const MAX_WAIT_ATTEMPTS = 60;
const WAIT_MS = 1000;

// 이전 세션 파일 제거
if (existsSync(URL_FILE)) {
  try { unlinkSync(URL_FILE); } catch {}
}

console.log("🌐 Cloudflare 터널 시작 중...");

let cf = null;

main().catch((error) => {
  console.error("터널 시작 실패:", error.message);
  process.exit(1);
});

/**
 * Next dev 서버가 실제로 바인딩한 포트를 찾은 뒤 cloudflared를 연결한다.
 * 3000이 이미 사용 중이면 Next가 3001, 3002...로 이동하므로 함께 탐색해야 한다.
 */
async function main() {
  const port = await waitForNextPort();
  console.log(`🔌 Next dev 포트 감지: ${port}`);

  cf = spawn(
    "npx",
    ["cloudflared", "tunnel", "--url", `http://127.0.0.1:${port}`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let urlFound = false;

  function extractUrl(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
      urlFound = true;
      const url = match[0];
      writeFileSync(URL_FILE, url, "utf-8");
      console.log(`\n✅ 터널 URL: ${url}\n`);
    }
  }

  cf.stdout.on("data", extractUrl);
  cf.stderr.on("data", extractUrl);

  cf.on("exit", (code) => {
    try { unlinkSync(URL_FILE); } catch {}
    if (code !== 0) {
      console.error("cloudflared 종료 (code:", code, ")");
    }
  });

  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.on(sig, () => {
      try { unlinkSync(URL_FILE); } catch {}
      cf?.kill();
      process.exit(0);
    });
  });
}

/**
 * Next dev 서버가 응답할 때까지 대기하면서 실제 사용 포트를 탐색한다.
 */
async function waitForNextPort() {
  for (let attempt = 0; attempt < MAX_WAIT_ATTEMPTS; attempt += 1) {
    for (let offset = 0; offset <= MAX_PORT_SCAN; offset += 1) {
      const port = DEFAULT_PORT + offset;
      if (await isNextServerReady(port)) {
        return port;
      }
    }

    await sleep(WAIT_MS);
  }

  throw new Error(`localhost:${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_SCAN} 범위에서 Next 서버를 찾지 못했습니다.`);
}

/**
 * `/join` 경로가 HTTP 응답을 반환하면 Next dev 서버가 준비된 것으로 본다.
 */
async function isNextServerReady(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/join`, {
      redirect: "manual",
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

/**
 * 짧은 재시도 대기를 위한 유틸리티다.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
