/**
 * Supabase Management API를 통해 마이그레이션 SQL을 실행한다.
 *
 * 실행: node scripts/run-migration-sql.mjs <migration-file>
 * 예: node scripts/run-migration-sql.mjs supabase/migrations/20260411_000006_normalize_game_content.sql
 *
 * 필요 환경변수:
 *   SUPABASE_URL — 프로젝트 URL (project ref 추출용)
 *   SUPABASE_ACCESS_TOKEN — Supabase 개인 액세스 토큰 (sbp_...)
 */

import fs from "fs";

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
const sqlFile = process.argv[2];

if (!sqlFile) {
  console.error("Usage: node scripts/run-migration-sql.mjs <sql-file>");
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, "utf8");
const projectRef = env.SUPABASE_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
const accessToken = env.SUPABASE_ACCESS_TOKEN;

if (!projectRef || !accessToken) {
  console.error("Need SUPABASE_URL and SUPABASE_ACCESS_TOKEN in .env");
  process.exit(1);
}

console.log(`Executing: ${sqlFile} (${sql.length} chars)`);
console.log(`Project: ${projectRef}`);

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query: sql }),
  }
);

if (!response.ok) {
  const errorText = await response.text();
  console.error(`Migration failed (HTTP ${response.status}):`, errorText);
  process.exit(1);
}

const result = await response.json();
console.log("Migration executed successfully");

// Show result summary
if (Array.isArray(result)) {
  for (const [i, r] of result.entries()) {
    if (r.error) {
      console.error(`Statement ${i}: ERROR -`, r.error);
    }
  }
} else if (result.error) {
  console.error("Error:", result.error);
}
