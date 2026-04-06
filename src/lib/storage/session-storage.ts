/**
 * session-storage.ts
 * 세션 파일 I/O — data/sessions/{sessionId}.json
 */

import fs from "fs";
import path from "path";
import type { GameSession } from "@/types/session";
import type { GamePackage } from "@/types/game";
import { buildInitialSession } from "@/lib/session-factory";

const SESSIONS_DIR = path.join(process.cwd(), "data", "sessions");

function ensureDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

export function createSession(
  game: GamePackage,
  sessionName?: string,
  hostUserId?: string
): GameSession {
  ensureDir();
  const session = buildInitialSession(game, undefined, undefined, undefined, sessionName, hostUserId);

  fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
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
