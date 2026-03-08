import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/storage/session-storage";
import { getGame } from "@/lib/storage/game-storage";
import { broadcast } from "@/lib/sse/broadcaster";
import type { VoteTally, VoteReveal } from "@/types/session";

type Params = { params: { sessionId: string } };

function revealVotes(sessionId: string, session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return;

  const game = getGame(session.gameId);
  const culpritPlayerId = game?.story.culpritPlayerId ?? "";

  // 득표 집계
  session.votes = session.votes ?? {};
  const tallyMap = new Map<string, { count: number; voterNames: string[] }>();
  for (const [token, targetPlayerId] of Object.entries(session.votes)) {
    const voter = session.playerStates.find((p) => p.token === token);
    if (!tallyMap.has(targetPlayerId)) tallyMap.set(targetPlayerId, { count: 0, voterNames: [] });
    const entry = tallyMap.get(targetPlayerId)!;
    entry.count++;
    if (voter) entry.voterNames.push(voter.playerName);
  }

  const tally: VoteTally[] = [...tallyMap.entries()].map(([playerId, data]) => ({
    playerId,
    count: data.count,
    voterNames: data.voterNames,
  })).sort((a, b) => b.count - a.count);

  const totalVotes = Object.keys(session.votes).length;
  const culpritVotes = tallyMap.get(culpritPlayerId)?.count ?? 0;
  const majorityCorrect = totalVotes > 0 && culpritVotes > totalVotes / 2;

  const reveal: VoteReveal = { tally, culpritPlayerId, majorityCorrect };
  session.sharedState.voteReveal = reveal;
  session.sharedState.phase = "ending";
  session.endedAt = new Date().toISOString();

  session.sharedState.eventLog.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    message: majorityCorrect
      ? "진범이 밝혀졌습니다! 수사관들의 승리입니다."
      : "진범이 도주에 성공했습니다.",
    type: "vote_revealed",
  });

  updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });
}

/** POST /api/sessions/[sessionId]/vote — 투표 제출 */
export async function POST(req: Request, { params }: Params) {
  const { sessionId } = params;
  const { token, targetPlayerId } = await req.json().catch(() => ({})) as {
    token?: string;
    targetPlayerId?: string;
  };

  if (!token || !targetPlayerId) {
    return NextResponse.json({ error: "token, targetPlayerId 필수" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.sharedState.phase !== "vote") {
    return NextResponse.json({ error: "투표 페이즈가 아닙니다" }, { status: 400 });
  }

  const voter = session.playerStates.find((p) => p.token === token);
  if (!voter) return NextResponse.json({ error: "Invalid token" }, { status: 403 });

  // 구형 세션 호환 (votes/voteCount 필드 없는 경우)
  session.votes = session.votes ?? {};
  session.sharedState.voteCount = session.sharedState.voteCount ?? 0;

  // 이미 투표했으면 덮어쓰기 (마음 바꾸기 허용)
  const alreadyVoted = token in session.votes;
  session.votes[token] = targetPlayerId;

  if (!alreadyVoted) {
    session.sharedState.voteCount++;
    session.sharedState.eventLog.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message: `${voter.playerName}님이 투표했습니다.`,
      type: "vote_submitted",
    });
  }

  // 참가한 전체 플레이어 수
  const totalPlayers = session.sharedState.characterSlots.filter((s) => s.isLocked).length;
  const allVoted = session.sharedState.voteCount >= totalPlayers;

  updateSession(session);
  broadcast(sessionId, "session_update", { sharedState: session.sharedState });

  // 전원 투표 완료 시 자동 공개
  if (allVoted) {
    revealVotes(sessionId, session);
  }

  return NextResponse.json({ ok: true, allVoted });
}

/** PATCH /api/sessions/[sessionId]/vote — GM 강제 공개 */
export async function PATCH(req: Request, { params }: Params) {
  const { sessionId } = params;
  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.sharedState.phase !== "vote") {
    return NextResponse.json({ error: "투표 페이즈가 아닙니다" }, { status: 400 });
  }

  revealVotes(sessionId, session);
  return NextResponse.json({ ok: true });
}
