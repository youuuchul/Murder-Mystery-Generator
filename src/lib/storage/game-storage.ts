/**
 * game-storage.ts
 * 게임 패키지 파일 I/O — data/games/{id}/ 디렉토리 기반
 */

import fs from "fs";
import path from "path";
import type { GameMetadata, GamePackage } from "@/types/game";

const GAMES_DIR = path.join(process.cwd(), "data", "games");

/** data/games/ 디렉토리 없으면 생성 */
function ensureGamesDir(): void {
  if (!fs.existsSync(GAMES_DIR)) {
    fs.mkdirSync(GAMES_DIR, { recursive: true });
  }
}

function gameDir(id: string): string {
  return path.join(GAMES_DIR, id);
}

function gamePath(id: string): string {
  return path.join(gameDir(id), "game.json");
}

function metadataPath(id: string): string {
  return path.join(gameDir(id), "metadata.json");
}

/**
 * 모든 게임의 메타데이터 목록 반환.
 * metadata.json만 읽어 빠른 로딩.
 */
export function listGames(): GameMetadata[] {
  ensureGamesDir();

  const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
  const metadataList: GameMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const mPath = metadataPath(entry.name);
    if (!fs.existsSync(mPath)) continue;

    try {
      const raw = fs.readFileSync(mPath, "utf-8");
      const metadata = JSON.parse(raw) as GameMetadata;
      metadataList.push(metadata);
    } catch {
      // 손상된 파일 건너뜀
      console.warn(`[game-storage] metadata 파싱 실패: ${entry.name}`);
    }
  }

  // 최신 수정 순
  return metadataList.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * 단일 게임 패키지 로드.
 * 없으면 null 반환.
 */
export function getGame(id: string): GamePackage | null {
  const gPath = gamePath(id);
  if (!fs.existsSync(gPath)) return null;

  try {
    const raw = fs.readFileSync(gPath, "utf-8");
    return JSON.parse(raw) as GamePackage;
  } catch {
    console.error(`[game-storage] game.json 파싱 실패: ${id}`);
    return null;
  }
}

/**
 * 게임 패키지 저장.
 * game.json + metadata.json 동시 기록.
 */
export function saveGame(game: GamePackage): void {
  ensureGamesDir();

  const dir = gameDir(game.id);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // game.json 전체 저장
  fs.writeFileSync(gamePath(game.id), JSON.stringify(game, null, 2), "utf-8");

  // metadata.json 경량 저장
  const metadata: GameMetadata = {
    id: game.id,
    title: game.title,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    settings: game.settings,
    playerCount: game.players?.length ?? 0,
    clueCount: game.clues.length,
    locationCount: game.locations?.length ?? 0,
  };
  fs.writeFileSync(metadataPath(game.id), JSON.stringify(metadata, null, 2), "utf-8");
}

/**
 * 게임 삭제 (폴더 전체 제거).
 * 없는 id면 false 반환.
 */
export function deleteGame(id: string): boolean {
  const dir = gameDir(id);
  if (!fs.existsSync(dir)) return false;

  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
