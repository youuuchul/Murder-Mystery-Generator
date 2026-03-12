import os from "os";
import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";

/** GET /api/server-info — 서버 LAN IP 목록 + 터널 URL 반환 */
export async function GET() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];

  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }

  // cloudflared 터널 URL (.tunnel-url 파일에서 읽기)
  let tunnelUrl: string | null = null;
  try {
    tunnelUrl = readFileSync(join(process.cwd(), ".tunnel-url"), "utf-8").trim() || null;
  } catch {}

  return NextResponse.json({ ips, tunnelUrl });
}
