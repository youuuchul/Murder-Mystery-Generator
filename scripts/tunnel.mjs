/**
 * Cloudflare 임시 터널 실행 스크립트
 * - cloudflared 실행 후 URL을 .tunnel-url 파일에 저장
 * - server-info API가 이 파일을 읽어 GM 화면에 표시
 */

import { spawn } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const URL_FILE = join(process.cwd(), ".tunnel-url");

// 이전 세션 파일 제거
if (existsSync(URL_FILE)) {
  try { unlinkSync(URL_FILE); } catch {}
}

console.log("🌐 Cloudflare 터널 시작 중...");

const cf = spawn(
  "npx",
  ["cloudflared", "tunnel", "--url", "http://localhost:3000"],
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

// 프로세스 종료 시 파일 정리
["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => {
    try { unlinkSync(URL_FILE); } catch {}
    cf.kill();
    process.exit(0);
  });
});
