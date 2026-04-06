import { NextRequest, NextResponse } from "next/server";
import { canAccessGmPlay } from "@/lib/game-access";
import {
  applyGmSessionAccessCookie,
  canResumeGmSessionDirectly,
  GM_SESSION_ACCESS_COOKIE_NAME,
} from "@/lib/gm-session-access";
import { getGame } from "@/lib/game-repository";
import { getRequestMakerUser } from "@/lib/maker-user.server";
import { getSession } from "@/lib/session-repository";

type Params = { params: { sessionId: string } };

interface AccessRequestBody {
  sessionCode?: string;
}

/**
 * 다른 GM 세션에 입장할 때 참가 코드를 검증하고,
 * 같은 브라우저 재진입을 위해 세션 접근 쿠키를 발급한다.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { sessionId } = params;
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const game = await getGame(session.gameId);
  const currentUser = await getRequestMakerUser(request);

  if (!game || !canAccessGmPlay(game, currentUser?.id)) {
    return NextResponse.json({ error: "이 세션에 들어갈 수 없습니다." }, { status: 403 });
  }

  if (!canResumeGmSessionDirectly(session, {
    currentUserId: currentUser?.id,
    cookieStore: request.cookies,
  })) {
    const { sessionCode } = await request.json().catch(() => ({})) as AccessRequestBody;
    if (!sessionCode || sessionCode.trim().toUpperCase() !== session.sessionCode.trim().toUpperCase()) {
      return NextResponse.json({ error: "세션 코드가 맞지 않습니다." }, { status: 403 });
    }
  }

  const response = NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      sessionName: session.sessionName,
    },
  });
  applyGmSessionAccessCookie(
    response,
    request.cookies.get(GM_SESSION_ACCESS_COOKIE_NAME)?.value,
    session
  );
  return response;
}
