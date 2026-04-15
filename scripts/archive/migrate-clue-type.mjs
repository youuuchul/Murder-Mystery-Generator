import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

/**
 * 단서 유형을 신규 2종 체계로 마이그레이션.
 *
 * 대상 테이블:
 * - game_clues.type          (단서 본체)
 * - game_cards.clue_type     (카드셋 복제본, card_type='clue' row만)
 *
 * 매핑:
 *   physical  -> owned
 *   testimony -> owned
 *   scene     -> shared
 *
 * 사용:
 *   node scripts/migrate-clue-type.mjs           # DRY-RUN (분포 출력)
 *   node scripts/migrate-clue-type.mjs --apply   # 실제 UPDATE 실행
 */

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const apply = process.argv.includes("--apply");
const LEGACY_TYPES = ["physical", "testimony", "scene"];
const NEW_TYPES = ["owned", "shared"];

async function countBy(table, column, extraFilter) {
  const types = [...LEGACY_TYPES, ...NEW_TYPES];
  const result = {};
  for (const t of types) {
    let q = sb.from(table).select("*", { count: "exact", head: true }).eq(column, t);
    if (extraFilter) q = extraFilter(q);
    const { count, error } = await q;
    if (error) throw new Error(`count ${table}.${column}=${t} failed: ${JSON.stringify(error)}`);
    result[t] = count ?? 0;
  }
  return result;
}

async function main() {
  console.log(`\n[${apply ? "APPLY" : "DRY-RUN"}] 단서 유형 마이그레이션\n`);

  console.log("== game_clues.type 현재 분포 ==");
  const gcBefore = await countBy("game_clues", "type");
  console.table(gcBefore);

  console.log("== game_cards.clue_type 현재 분포 (card_type='clue'만) ==");
  const gkBefore = await countBy("game_cards", "clue_type", (q) => q.eq("card_type", "clue"));
  console.table(gkBefore);

  if (!apply) {
    const legacyClues = gcBefore.physical + gcBefore.testimony + gcBefore.scene;
    const legacyCards = gkBefore.physical + gkBefore.testimony + gkBefore.scene;
    console.log("\n변경 예정:");
    console.log(`  game_clues legacy -> new: ${legacyClues} rows`);
    console.log(`  game_cards legacy -> new: ${legacyCards} rows`);
    console.log("\n실제 실행: node scripts/migrate-clue-type.mjs --apply\n");
    return;
  }

  // game_clues: physical/testimony -> owned
  const r1 = await sb.from("game_clues").update({ type: "owned" }).in("type", ["physical", "testimony"]);
  if (r1.error) throw new Error(`game_clues -> owned: ${JSON.stringify(r1.error)}`);

  // game_clues: scene -> shared
  const r2 = await sb.from("game_clues").update({ type: "shared" }).eq("type", "scene");
  if (r2.error) throw new Error(`game_clues -> shared: ${JSON.stringify(r2.error)}`);

  // game_cards: physical/testimony -> owned (card_type='clue'만)
  const r3 = await sb.from("game_cards").update({ clue_type: "owned" }).eq("card_type", "clue").in("clue_type", ["physical", "testimony"]);
  if (r3.error) throw new Error(`game_cards -> owned: ${JSON.stringify(r3.error)}`);

  // game_cards: scene -> shared (card_type='clue'만)
  const r4 = await sb.from("game_cards").update({ clue_type: "shared" }).eq("card_type", "clue").eq("clue_type", "scene");
  if (r4.error) throw new Error(`game_cards -> shared: ${JSON.stringify(r4.error)}`);

  console.log("\nUPDATE 완료");

  console.log("\n== game_clues.type 변경 후 ==");
  const gcAfter = await countBy("game_clues", "type");
  console.table(gcAfter);

  console.log("== game_cards.clue_type 변경 후 (card_type='clue') ==");
  const gkAfter = await countBy("game_cards", "clue_type", (q) => q.eq("card_type", "clue"));
  console.table(gkAfter);

  const legacyClueLeft = gcAfter.physical + gcAfter.testimony + gcAfter.scene;
  const legacyCardLeft = gkAfter.physical + gkAfter.testimony + gkAfter.scene;
  if (legacyClueLeft + legacyCardLeft > 0) {
    console.warn(`\n⚠ 잔여 legacy: clues=${legacyClueLeft}, cards=${legacyCardLeft}`);
  } else {
    console.log("\n✓ legacy 값 완전 제거됨");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
