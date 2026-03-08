import os from "os";
import { NextResponse } from "next/server";

/** GET /api/server-info — 서버 LAN IP 목록 반환 */
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

  return NextResponse.json({ ips });
}
