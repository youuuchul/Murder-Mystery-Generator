import { subscribe, unsubscribe } from "@/lib/sse/broadcaster";
import { getSession } from "@/lib/storage/session-storage";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** GET /api/sessions/[sessionId]/events — SSE 스트림 */
export async function GET(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) return new Response("Session not found", { status: 404 });

  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let pingInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      subscribe(sessionId, ctrl);

      // 초기 상태 즉시 전송
      ctrl.enqueue(
        encoder.encode(
          `event: session_update\ndata: ${JSON.stringify({ sharedState: session.sharedState })}\n\n`
        )
      );

      // 25초마다 keepalive ping (프록시/브라우저 타임아웃 방지)
      pingInterval = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 25000);
    },
    cancel() {
      clearInterval(pingInterval);
      unsubscribe(sessionId, ctrl);
    },
  });

  req.signal.addEventListener("abort", () => {
    clearInterval(pingInterval);
    try {
      unsubscribe(sessionId, ctrl);
      ctrl.close();
    } catch {}
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
