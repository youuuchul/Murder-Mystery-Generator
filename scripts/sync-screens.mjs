#!/usr/bin/env node
/**
 * docs/screens.json 을 Google Sheets에 덮어쓰기한다.
 *
 * 필수 환경변수 (.env.local)
 *   - GOOGLE_SHEETS_SPREADSHEET_ID
 *   - GOOGLE_SERVICE_ACCOUNT_KEY_JSON  (JSON 문자열 한 줄)
 *
 * 실행: npm run sync:screens
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(projectRoot, ".env.local") });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const RAW_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;

if (!SPREADSHEET_ID) {
  console.error("[sync-screens] GOOGLE_SHEETS_SPREADSHEET_ID 누락");
  process.exit(1);
}
if (!RAW_KEY) {
  console.error("[sync-screens] GOOGLE_SERVICE_ACCOUNT_KEY_JSON 누락");
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(RAW_KEY);
} catch (error) {
  console.error("[sync-screens] GOOGLE_SERVICE_ACCOUNT_KEY_JSON 파싱 실패:", error.message);
  process.exit(1);
}

// googleapis는 private_key 안의 \n 이스케이프를 실제 줄바꿈으로 바꿔야 한다.
if (typeof credentials.private_key === "string") {
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

/**
 * 특정 화면 ID에 해당하는 스크린샷 파일을 찾는다.
 * 규칙: `P-XXX.png` 기본 + `P-XXX_*.png` 변형.
 * Phase 2에서 Drive 업로드로 대체될 자리.
 */
function summarizeScreenshots(screenId, files) {
  if (!screenId) return "";
  const prefix = screenId;
  const matches = files.filter(
    (name) => name === `${prefix}.png` || name.startsWith(`${prefix}_`) || name.startsWith(`${prefix}.`)
  );
  // 정확히 매칭되는 것만 카운트 (P-017이 P-017.1을 흡수하지 않도록)
  const exact = matches.filter((name) => {
    const base = name.replace(/\.(png|jpg|jpeg|webp|gif)$/i, "");
    return base === prefix || base.startsWith(`${prefix}_`);
  });
  if (exact.length === 0) return "미캡처";
  if (exact.length === 1) return `있음 (${exact[0]})`;
  return `있음 ×${exact.length}`;
}

async function listScreenshotFiles(projectRoot) {
  const dir = path.join(projectRoot, "docs", "screenshots");
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => /\.(png|jpg|jpeg|webp|gif)$/i.test(name));
  } catch {
    return [];
  }
}

/** 시트 단위 쓰기 작업 한 묶음을 기술한다. */
function buildSheetUpdates(screens, screenshotFiles) {
  const header = [
    "ID",
    "구분",
    "페이지 경로",
    "파일 경로",
    "목적",
    "주요 컴포넌트",
    "DB/외부 의존",
    "권한/가드",
    "관련 백로그",
    "마지막 검토일",
    "스크린샷",
    "비고",
  ];
  const rows = screens.map((s) => [
    s.id ?? "",
    s.category ?? "",
    s.route ?? "",
    s.file ?? "",
    s.purpose ?? "",
    (s.components ?? []).join(", "),
    (s.dependencies ?? []).join(", "),
    s.auth ?? "",
    (s.backlog ?? []).join(", "),
    s.reviewedAt ?? "",
    summarizeScreenshots(s.id, screenshotFiles),
    s.notes ?? "",
  ]);
  return [header, ...rows];
}

async function ensureSheetExists(title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const found = meta.data.sheets?.some((s) => s.properties?.title === title);
  if (found) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
}

async function overwriteSheet(title, values) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: title,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function main() {
  const inputPath = path.join(projectRoot, "docs", "screens.json");
  const raw = await readFile(inputPath, "utf8");
  const data = JSON.parse(raw);

  const sheetTitle = data.sheetName || "화면 설계서";
  const screens = Array.isArray(data.screens) ? data.screens : [];

  const screenshotFiles = await listScreenshotFiles(projectRoot);
  console.log(`[sync-screens] 화면 ${screens.length}개 / 스크린샷 파일 ${screenshotFiles.length}개 → 시트: ${sheetTitle}`);

  await ensureSheetExists(sheetTitle);
  const values = buildSheetUpdates(screens, screenshotFiles);
  await overwriteSheet(sheetTitle, values);

  console.log("[sync-screens] 완료");
}

main().catch((error) => {
  console.error("[sync-screens] 실패:", error?.message ?? error);
  process.exit(1);
});
