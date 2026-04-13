import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

async function main() {
  const { count: sessionsTotal } = await sb
    .from("sessions")
    .select("id", { count: "exact", head: true });
  const { count: sessionsActive } = await sb
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null);
  const { count: sessionsEnded } = await sb
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .not("ended_at", "is", null);
  const { count: profilesCount } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true });
  const { count: gamesCount } = await sb
    .from("games")
    .select("id", { count: "exact", head: true });
  const { count: publicGamesCount } = await sb
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("visibility", "public");

  console.log("== DB 카운트 ==");
  console.log({
    sessionsTotal,
    sessionsActive,
    sessionsEnded,
    profilesCount,
    gamesCount,
    publicGamesCount,
  });

  // 세션 JSON 크기 체크 — 상위 10개
  const { data: sessions } = await sb
    .from("sessions")
    .select("id,session_code,phase,ended_at,updated_at,session_json")
    .order("updated_at", { ascending: false })
    .limit(30);

  const sized = (sessions ?? []).map((s) => {
    const jsonStr = JSON.stringify(s.session_json ?? {});
    const eventLogLen = s.session_json?.sharedState?.eventLog?.length ?? 0;
    return {
      id: s.id.slice(0, 8),
      code: s.session_code,
      phase: s.phase,
      ended: s.ended_at ? "Y" : "N",
      bytes: jsonStr.length,
      eventLog: eventLogLen,
      updated: s.updated_at,
    };
  });
  console.log("\n== 최근 세션 30개 JSON 크기 ==");
  console.table(sized);

  const totalBytes = sized.reduce((s, r) => s + r.bytes, 0);
  console.log(`최근 30개 합계 바이트: ${totalBytes.toLocaleString()} (avg ${Math.round(totalBytes / Math.max(sized.length, 1)).toLocaleString()})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
