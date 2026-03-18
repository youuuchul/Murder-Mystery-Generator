/**
 * Next dev 서버와 Cloudflare Tunnel을 같은 포트로 묶어 실행한다.
 * - 먼저 사용 가능한 포트를 직접 고른다.
 * - 선택한 포트로 Next dev를 실행한다.
 * - 같은 포트로 cloudflared 터널을 연결한다.
 * 이렇게 하면 Next가 3001, 3002로 밀려도 터널이 잘못된 포트를 잡는 문제를 막을 수 있다.
 */

import net from "net";
import { spawn } from "child_process";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const URL_FILE = join(process.cwd(), ".tunnel-url");
const HOST = "0.0.0.0";
const DEFAULT_PORT = Number(process.env.PORT || 3000);
const MAX_PORT_SCAN = 200;
const NEXT_READY_PATTERN = /- Local:\s+http:\/\/localhost:(\d+)/;

let nextProcess = null;
let tunnelProcess = null;
let shuttingDown = false;

cleanupUrlFile();

main().catch((error) => {
  console.error("dev:tunnel 시작 실패:", error.message);
  shutdown(1);
});

/**
 * 실행 가능한 포트를 잡고 Next와 Tunnel을 순서대로 시작한다.
 */
async function main() {
  const port = await findAvailablePort(DEFAULT_PORT, MAX_PORT_SCAN);
  console.log(`🌐 선택한 개발 포트: ${port}`);

  nextProcess = spawn(
    "npx",
    ["next", "dev", "-H", HOST, "-p", String(port)],
    {
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ["inherit", "pipe", "pipe"],
    }
  );

  pipeOutput(nextProcess.stdout, "[next]");
  pipeOutput(nextProcess.stderr, "[next]");

  const actualPort = await waitForNextReady(nextProcess, port);
  console.log(`🔌 Next dev 준비 완료: ${actualPort}`);

  tunnelProcess = spawn(
    "npx",
    ["cloudflared", "tunnel", "--url", `http://127.0.0.1:${actualPort}`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  tunnelProcess.stdout.on("data", handleTunnelOutput);
  tunnelProcess.stderr.on("data", handleTunnelOutput);

  nextProcess.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`next dev 종료 (code: ${code ?? "null"})`);
      shutdown(typeof code === "number" ? code : 1);
    }
  });

  tunnelProcess.on("exit", (code) => {
    cleanupUrlFile();
    if (!shuttingDown && code !== 0) {
      console.error(`cloudflared 종료 (code: ${code ?? "null"})`);
      shutdown(typeof code === "number" ? code : 1);
    }
  });
}

/**
 * 출력 스트림을 접두어와 함께 그대로 전달한다.
 */
function pipeOutput(stream, prefix) {
  stream.on("data", (data) => {
    process.stdout.write(`${prefix} ${data.toString()}`);
  });
}

/**
 * Next dev가 실제 준비될 때까지 대기하고, 출력된 포트가 있으면 그 값을 우선 사용한다.
 */
function waitForNextReady(child, expectedPort) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    let seenPort = expectedPort;

    const onData = (data) => {
      const text = data.toString();
      const matchedPort = text.match(NEXT_READY_PATTERN)?.[1];
      if (matchedPort) {
        seenPort = Number(matchedPort);
      }

      if (text.includes("Ready in")) {
        resolved = true;
        cleanup();
        resolve(seenPort);
      }
    };

    const onExit = (code) => {
      if (!resolved) {
        cleanup();
        reject(new Error(`next dev가 준비되기 전에 종료됨 (code: ${code ?? "null"})`));
      }
    };

    const cleanup = () => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

/**
 * cloudflared 출력에서 공개 URL을 추출해 .tunnel-url 파일에 저장한다.
 */
function handleTunnelOutput(data) {
  const text = data.toString();
  process.stdout.write(`[tunnel] ${text}`);

  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) {
    return;
  }

  const url = match[0];
  writeFileSync(URL_FILE, url, "utf-8");
  console.log(`\n✅ 터널 URL: ${url}\n`);
}

/**
 * 시작 포트부터 순서대로 바인딩 가능 여부를 확인한다.
 */
async function findAvailablePort(startPort, maxOffset) {
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const port = startPort + offset;
    if (await canListen(port)) {
      return port;
    }
  }

  throw new Error(`사용 가능한 포트를 찾지 못했습니다: ${startPort}-${startPort + maxOffset}`);
}

/**
 * 포트에 임시 바인딩이 가능하면 비어 있다고 판단한다.
 */
function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, HOST);
  });
}

/**
 * 남아 있는 터널 URL 파일을 제거한다.
 */
function cleanupUrlFile() {
  if (!existsSync(URL_FILE)) {
    return;
  }

  try {
    unlinkSync(URL_FILE);
  } catch {}
}

/**
 * 자식 프로세스를 정리하고 종료한다.
 */
function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  cleanupUrlFile();

  tunnelProcess?.kill("SIGTERM");
  nextProcess?.kill("SIGTERM");

  setTimeout(() => {
    process.exit(exitCode);
  }, 100);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
