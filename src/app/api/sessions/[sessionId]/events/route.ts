import { NextRequest } from "next/server";
import { canAccessGmPlay } from "@/lib/game-access";
import { canResumeGmSessionDirectly } from "@/lib/gm-session-access";
import { getGame } from "@/lib/game-repository";
import { isMakerAdmin } from "@/lib/maker-role";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { subscribe, unsubscribe } from "@/lib/sse/broadcaster";
import { getSession } from "@/lib/session-repository";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** GET /api/sessions/[sessionId]/events — SSE 스트림 */
export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const { sessionId } = params;
  const token = new URL(req.url).searchParams.get("token");
  const session = await getSession(sessionId);
  if (!session) return new Response("Session not found", { status: 404 });

  if (token) {
    const playerState = session.playerStates.find((item) => item.token === token);
    if (!playerState) {
      return new Response("Invalid token", { status: 403 });
    }
  } else {
    const game = await getGame(session.gameId);
    const currentUser = await getRequestMakerUser(req);

    if (!game || !canAccessGmPlay(game, currentUser)) {
      return new Response("Forbidden", { status: 403 });
    }

    const canResume = canResumeGmSessionDirectly(session, {
      currentUserId: currentUser?.id,
      isAdmin: isMakerAdmin(currentUser),
      cookieStore: req.cookies,
    });
    if (!canResume) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  let pingInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      subscribe(sessionId, ctrl);

      // Cloudflare 등 프록시의 초기 버퍼를 즉시 플러시하기 위한 2kB 패딩
      // 패딩이 없으면 첫 이벤트가 버퍼에 묶여 지연 전달됨
      ctrl.enqueue(encoder.encode(`: ${" ".repeat(2048)}\n\n`));

      // 초기 상태 즉시 전송
      ctrl.enqueue(
        encoder.encode(
          `event: session_update\ndata: ${JSON.stringify({ sharedState: session.sharedState })}\n\n`
        )
      );

      // 5초마다 keepalive ping 이벤트 전송
      // 프록시 플러시와 클라이언트 dead-connection 감지를 동시에 만족시킨다.
      pingInterval = setInterval(() => {
        try {
          ctrl.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 5000);
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
