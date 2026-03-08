/**
 * session-storage.ts
 * 세션 파일 I/O — data/sessions/{sessionId}.json
 */

import fs from "fs";
import path from "path";
import type { GameSession, CharacterSlot } from "@/types/session";
import type { GamePackage } from "@/types/game";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

/** 헷갈리기 쉬운 문자 제외한 코드 생성 */
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createSession(game: GamePackage): GameSession {
  ensureDir();
  const id = crypto.randomUUID();
  const sessionCode = generateCode();

  const slots: CharacterSlot[] = game.players.map((p) => ({
    playerId: p.id,
    playerName: null,
    token: null,
    isLocked: false,
  }));

  const session: GameSession = {
    id,
    gameId: game.id,
    sessionCode,
    createdAt: new Date().toISOString(),
    sharedState: {
      phase: "lobby",
      currentRound: 0,
      publicClueIds: [],
      acquiredClueIds: [],
      eventLog: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          message: "세션이 생성됐습니다.",
          type: "system",
        },
      ],
      characterSlots: slots,
      voteCount: 0,
    },
    playerStates: [],
    votes: {},
  };

  fs.writeFileSync(sessionPath(id), JSON.stringify(session, null, 2), "utf-8");
  return session;
}

export function getSession(id: string): GameSession | null {
  try {
    const raw = fs.readFileSync(sessionPath(id), "utf-8");
    return JSON.parse(raw) as GameSession;
  } catch {
    return null;
  }
}

/** 6자리 코드로 세션 검색 (소수 세션이라 순회 방식 OK) */
export function getSessionByCode(code: string): GameSession | null {
  ensureDir();
  const upper = code.toUpperCase();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      const session = JSON.parse(
        fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8")
      ) as GameSession;
      if (session.sessionCode === upper) return session;
    } catch {
      // 손상 파일 건너뜀
    }
  }
  return null;
}

export function updateSession(session: GameSession): void {
  ensureDir();
  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
}

/** 특정 게임의 활성 세션 목록 */
export function deleteSession(id: string): boolean {
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}

export function listActiveSessions(gameId: string): GameSession[] {
  ensureDir();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const result: GameSession[] = [];
  for (const file of files) {
    try {
      const s = JSON.parse(
        fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8")
      ) as GameSession;
      if (s.gameId === gameId && !s.endedAt) result.push(s);
    } catch {}
  }
  return result.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
