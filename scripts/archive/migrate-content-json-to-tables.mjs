/**
 * content_json → 정규화 테이블 데이터 이관 스크립트.
 *
 * 실행:
 *   node scripts/migrate-content-json-to-tables.mjs --dry-run   (조회만)
 *   node scripts/migrate-content-json-to-tables.mjs --apply      (실제 이관)
 */

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const dryRun = !process.argv.includes("--apply");
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(dryRun ? "=== DRY RUN ===" : "=== APPLYING ===");

// 1. Load all content_json
const { data: contentRows, error: contentError } = await supabase
  .from("game_content")
  .select("game_id, content_json");

if (contentError) {
  console.error("Failed to load content:", contentError.message);
  process.exit(1);
}

console.log(`\nLoaded ${contentRows.length} games from game_content\n`);

let totalInserts = 0;

for (const row of contentRows) {
  const game = row.content_json;
  const gameId = row.game_id;
  console.log(`--- ${game.title || gameId} ---`);

  // ── games 확장 컬럼 업데이트 ──
  const gamesUpdate = {
    cover_image_url: game.settings?.coverImageUrl || null,
    cover_image_position_x: game.settings?.coverImagePosition?.x ?? 50,
    cover_image_position_y: game.settings?.coverImagePosition?.y ?? 50,
    cover_image_zoom: game.settings?.coverImagePosition?.zoom ?? 1,
    opening_duration_minutes: game.rules?.openingDurationMinutes ?? 5,
    phases: game.rules?.phases ?? [],
    private_chat_config: game.rules?.privateChat ?? { enabled: false, maxGroupSize: 2, durationMinutes: 5 },
    card_trading_enabled: game.rules?.cardTrading?.enabled ?? true,
    clues_per_round: game.rules?.cluesPerRound ?? 2,
    allow_location_revisit: game.rules?.allowLocationRevisit ?? false,
  };
  console.log("  games UPDATE:", Object.keys(gamesUpdate).length, "columns");

  if (!dryRun) {
    const { error } = await supabase.from("games").update(gamesUpdate).eq("id", gameId);
    if (error) throw new Error(`games update failed for ${gameId}: ${error.message}`);
  }

  // ── game_stories ──
  const story = game.story || {};
  const storyRow = {
    game_id: gameId,
    synopsis: story.synopsis || "",
    incident: story.incident || "",
    gm_overview: story.gmOverview || null,
    map_image_url: story.mapImageUrl || null,
    victim_name: story.victim?.name || "",
    victim_background: story.victim?.background || "",
    victim_image_url: story.victim?.imageUrl || null,
    culprit_player_id: story.culpritPlayerId || "",
    motive: story.motive || "",
    method: story.method || "",
    timeline_enabled: story.timeline?.enabled ?? false,
  };
  console.log("  game_stories: 1 row");
  totalInserts++;

  if (!dryRun) {
    const { error } = await supabase.from("game_stories").upsert(storyRow, { onConflict: "game_id" });
    if (error) throw new Error(`game_stories upsert failed: ${error.message}`);
  }

  // ── game_timeline_slots ──
  const slots = story.timeline?.slots || [];
  if (slots.length > 0) {
    const slotRows = slots.map((s, i) => ({
      id: s.id,
      game_id: gameId,
      slot_label: s.label || "",
      sort_order: i,
    }));
    console.log(`  game_timeline_slots: ${slotRows.length} rows`);
    totalInserts += slotRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_timeline_slots").upsert(slotRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_timeline_slots upsert failed: ${error.message}`);
    }
  }

  // ── game_npcs ──
  const npcs = story.npcs || [];
  if (npcs.length > 0) {
    const npcRows = npcs.map((n, i) => ({
      id: n.id,
      game_id: gameId,
      name: n.name || "",
      background: n.background || "",
      image_url: n.imageUrl || null,
      sort_order: i,
    }));
    console.log(`  game_npcs: ${npcRows.length} rows`);
    totalInserts += npcRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_npcs").upsert(npcRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_npcs upsert failed: ${error.message}`);
    }
  }

  // ── game_players ──
  const players = game.players || [];
  if (players.length > 0) {
    const playerRows = players.map((p, i) => ({
      id: p.id,
      game_id: gameId,
      name: p.name || "",
      background: p.background || "",
      story: p.story || p.alibi || "",
      secret: p.secret || "",
      victory_condition: p.victoryCondition || "arrest-culprit",
      personal_goal: p.personalGoal || null,
      score_conditions: p.scoreConditions || [],
      card_image: p.cardImage || null,
      sort_order: i,
    }));
    console.log(`  game_players: ${playerRows.length} rows`);
    totalInserts += playerRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_players").upsert(playerRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_players upsert failed: ${error.message}`);
    }

    // ── player_timeline_entries ──
    const timelineEntries = [];
    for (const p of players) {
      for (const te of p.timelineEntries || []) {
        if (te.slotId && te.action) {
          timelineEntries.push({
            game_id: gameId,
            player_id: p.id,
            slot_id: te.slotId,
            action: te.action,
          });
        }
      }
    }
    if (timelineEntries.length > 0) {
      console.log(`  player_timeline_entries: ${timelineEntries.length} rows`);
      totalInserts += timelineEntries.length;
      if (!dryRun) {
        const { error } = await supabase.from("player_timeline_entries").upsert(timelineEntries, { onConflict: "game_id,player_id,slot_id" });
        if (error) throw new Error(`player_timeline_entries upsert failed: ${error.message}`);
      }
    }

    // ── player_relationships ──
    const relationships = [];
    for (const p of players) {
      for (const [i, r] of (p.relationships || []).entries()) {
        relationships.push({
          game_id: gameId,
          player_id: p.id,
          target_type: r.targetType || "player",
          target_id: r.targetId || r.playerId || "",
          description: r.description || "",
          sort_order: i,
        });
      }
    }
    if (relationships.length > 0) {
      console.log(`  player_relationships: ${relationships.length} rows`);
      totalInserts += relationships.length;
      if (!dryRun) {
        // Delete existing then insert (no natural PK for upsert)
        await supabase.from("player_relationships").delete().eq("game_id", gameId);
        const { error } = await supabase.from("player_relationships").insert(relationships);
        if (error) throw new Error(`player_relationships insert failed: ${error.message}`);
      }
    }

    // ── player_related_clues ──
    const relatedClues = [];
    for (const p of players) {
      for (const rc of p.relatedClues || []) {
        if (rc.clueId) {
          relatedClues.push({
            game_id: gameId,
            player_id: p.id,
            clue_id: rc.clueId,
            note: rc.note || "",
          });
        }
      }
    }
    if (relatedClues.length > 0) {
      console.log(`  player_related_clues: ${relatedClues.length} rows`);
      totalInserts += relatedClues.length;
      if (!dryRun) {
        const { error } = await supabase.from("player_related_clues").upsert(relatedClues, { onConflict: "game_id,player_id,clue_id" });
        if (error) throw new Error(`player_related_clues upsert failed: ${error.message}`);
      }
    }
  }

  // ── game_locations ──
  const locations = game.locations || [];
  if (locations.length > 0) {
    const locationRows = locations.map((l, i) => ({
      id: l.id,
      game_id: gameId,
      name: l.name || "",
      description: l.description || "",
      image_url: l.imageUrl || null,
      unlocks_at_round: l.unlocksAtRound ?? null,
      owner_player_id: l.ownerPlayerId || null,
      access_condition: l.accessCondition || null,
      sort_order: i,
    }));
    console.log(`  game_locations: ${locationRows.length} rows`);
    totalInserts += locationRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_locations").upsert(locationRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_locations upsert failed: ${error.message}`);
    }
  }

  // ── game_clues ──
  const clues = game.clues || [];
  if (clues.length > 0) {
    const clueRows = clues.map((c, i) => ({
      id: c.id,
      game_id: gameId,
      title: c.title || "",
      description: c.description || "",
      type: c.type || "physical",
      image_url: c.imageUrl || null,
      location_id: c.locationId || null,
      condition: c.condition || null,
      sort_order: i,
    }));
    console.log(`  game_clues: ${clueRows.length} rows`);
    totalInserts += clueRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_clues").upsert(clueRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_clues upsert failed: ${error.message}`);
    }
  }

  // ── game_scripts ──
  const scripts = game.scripts || {};
  const scriptRows = [];

  for (const phase of ["lobby", "opening", "vote", "ending", "endingSuccess", "endingFail"]) {
    const seg = scripts[phase];
    if (!seg) continue;
    const dbPhase = phase === "endingSuccess" ? "ending_success" : phase === "endingFail" ? "ending_fail" : phase;
    scriptRows.push({
      game_id: gameId,
      phase: dbPhase,
      round_number: 0,
      narration: seg.narration || "",
      image_url: null,
      video_url: seg.videoUrl || null,
      background_music: seg.backgroundMusic || null,
      gm_note: seg.gmNote || null,
      unlocked_location_ids: [],
    });
  }

  for (const rs of scripts.rounds || []) {
    scriptRows.push({
      game_id: gameId,
      phase: "round",
      round_number: rs.round,
      narration: rs.narration || "",
      image_url: rs.imageUrl || null,
      video_url: rs.videoUrl || null,
      background_music: rs.backgroundMusic || null,
      gm_note: rs.gmNote || null,
      unlocked_location_ids: rs.unlockedLocationIds || [],
    });
  }

  if (scriptRows.length > 0) {
    console.log(`  game_scripts: ${scriptRows.length} rows`);
    totalInserts += scriptRows.length;

    if (!dryRun) {
      // Delete and re-insert (composite PK with COALESCE makes upsert tricky)
      await supabase.from("game_scripts").delete().eq("game_id", gameId);
      const { error } = await supabase.from("game_scripts").insert(scriptRows);
      if (error) throw new Error(`game_scripts insert failed: ${error.message}`);
    }
  }

  // ─��� game_cards ──
  const cards = game.cards || {};
  const cardRows = [];

  for (const [i, cc] of (cards.characterCards || []).entries()) {
    cardRows.push({
      game_id: gameId,
      card_type: "character",
      player_id: cc.playerId,
      front_text: cc.frontText || "",
      back_text: cc.backText || "",
      sort_order: i,
    });
  }

  for (const [i, cc] of (cards.clueCards || []).entries()) {
    cardRows.push({
      game_id: gameId,
      card_type: "clue",
      clue_id: cc.clueId,
      clue_title: cc.title || "",
      clue_description: cc.description || "",
      clue_type: cc.type || "physical",
      clue_image_url: cc.imageUrl || null,
      sort_order: i,
    });
  }

  for (const [i, ec] of (cards.eventCards || []).entries()) {
    cardRows.push({
      game_id: gameId,
      card_type: "event",
      round_number: ec.round,
      event_title: ec.title || "",
      event_description: ec.description || "",
      unlocked_location_ids: ec.unlockedLocationIds || [],
      sort_order: i,
    });
  }

  if (cardRows.length > 0) {
    console.log(`  game_cards: ${cardRows.length} rows`);
    totalInserts += cardRows.length;

    if (!dryRun) {
      await supabase.from("game_cards").delete().eq("game_id", gameId);
      const { error } = await supabase.from("game_cards").insert(cardRows);
      if (error) throw new Error(`game_cards insert failed: ${error.message}`);
    }
  }

  // ── game_ending_config ──
  const ending = game.ending || {};
  const endingConfigRow = {
    game_id: gameId,
    author_notes_enabled: ending.authorNotesEnabled ?? false,
  };
  console.log("  game_ending_config: 1 row");
  totalInserts++;

  if (!dryRun) {
    const { error } = await supabase.from("game_ending_config").upsert(endingConfigRow, { onConflict: "game_id" });
    if (error) throw new Error(`game_ending_config upsert failed: ${error.message}`);
  }

  // ── game_ending_branches ──
  const branches = ending.branches || [];
  if (branches.length > 0) {
    const branchRows = branches.map((b, i) => ({
      id: b.id,
      game_id: gameId,
      label: b.label || "",
      trigger_type: b.triggerType || "wrong-arrest-fallback",
      target_player_id: b.targetPlayerId || null,
      story_text: b.storyText || "",
      personal_endings_enabled: b.personalEndingsEnabled ?? false,
      video_url: b.videoUrl || null,
      background_music: b.backgroundMusic || null,
      sort_order: i,
    }));
    console.log(`  game_ending_branches: ${branchRows.length} rows`);
    totalInserts += branchRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_ending_branches").upsert(branchRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_ending_branches upsert failed: ${error.message}`);
    }

    // ── branch_personal_endings ──
    const personalEndingRows = [];
    for (const b of branches) {
      for (const pe of b.personalEndings || []) {
        personalEndingRows.push({
          game_id: gameId,
          branch_id: b.id,
          player_id: pe.playerId,
          title: pe.title || null,
          body_text: pe.text || "",
        });
      }
    }
    if (personalEndingRows.length > 0) {
      console.log(`  branch_personal_endings: ${personalEndingRows.length} rows`);
      totalInserts += personalEndingRows.length;
      if (!dryRun) {
        const { error } = await supabase.from("branch_personal_endings").upsert(personalEndingRows, { onConflict: "game_id,branch_id,player_id" });
        if (error) throw new Error(`branch_personal_endings upsert failed: ${error.message}`);
      }
    }
  }

  // ── game_author_notes ──
  const authorNotes = ending.authorNotes || [];
  if (authorNotes.length > 0) {
    const noteRows = authorNotes.map((n, i) => ({
      id: n.id,
      game_id: gameId,
      title: n.title || "",
      content: n.content || "",
      sort_order: i,
    }));
    console.log(`  game_author_notes: ${noteRows.length} rows`);
    totalInserts += noteRows.length;

    if (!dryRun) {
      const { error } = await supabase.from("game_author_notes").upsert(noteRows, { onConflict: "game_id,id" });
      if (error) throw new Error(`game_author_notes upsert failed: ${error.message}`);
    }
  }

  console.log();
}

console.log(`\nTotal insert operations: ${totalInserts}`);
console.log(dryRun ? "\nDry run complete. Use --apply to execute." : "\nMigration complete.");
