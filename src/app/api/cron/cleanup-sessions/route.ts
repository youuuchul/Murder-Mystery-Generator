import { NextRequest, NextResponse } from "next/server";
import { deleteSession, listExpiredSessions } from "@/lib/session-repository";

/**
 * Vercel Cron 전용: 24시간 넘게 방치된 세션을 삭제한다.
 *
 * - 엔딩 완료(`endedAt` 있음) 이후 24h 초과 → 삭제
 * - 엔딩 없이 `updatedAt` 기준 24h 동안 활동 없음 → 삭제
 *
 * 인증: Vercel Cron은 `Authorization: Bearer <CRON_SECRET>` 헤더를 자동 첨부한다.
 * `CRON_SECRET`이 설정되지 않았으면 500으로 거부한다(운영 환경 가드).
 */
const DEFAULT_EXPIRY_HOURS = 24;

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/cleanup-sessions] CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const overrideHours = Number(url.searchParams.get("hours") ?? "");
  const hours = Number.isFinite(overrideHours) && overrideHours > 0
    ? overrideHours
    : DEFAULT_EXPIRY_HOURS;

  const startedAt = Date.now();
  let expired;
  try {
    expired = await listExpiredSessions(hours);
  } catch (error) {
    console.error("[cron/cleanup-sessions] listExpiredSessions failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list expired sessions" },
      { status: 500 }
    );
  }

  const results: { id: string; deleted: boolean; reason: string; error?: string }[] = [];
  for (const session of expired) {
    const reason = session.endedAt ? "ended_over_threshold" : "inactive_over_threshold";
    try {
      const deleted = await deleteSession(session.id);
      results.push({ id: session.id, deleted, reason });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[cron/cleanup-sessions] delete failed sessionId=${session.id} reason=${reason}: ${message}`
      );
      results.push({ id: session.id, deleted: false, reason, error: message });
    }
  }

  const deletedCount = results.filter((r) => r.deleted).length;
  const failedCount = results.length - deletedCount;
  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[cron/cleanup-sessions] thresholdHours=${hours} scanned=${expired.length} deleted=${deletedCount} failed=${failedCount} elapsedMs=${elapsedMs}`
  );

  return NextResponse.json({
    thresholdHours: hours,
    scanned: expired.length,
    deleted: deletedCount,
    failed: failedCount,
    elapsedMs,
    results,
  });
}
