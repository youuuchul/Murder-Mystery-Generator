#!/usr/bin/env node
/**
 * docs/product-control/product-control-data.json 을 Google Sheets PM 통제 탭에 동기화한다.
 *
 * 필수 환경변수(.env.local):
 * - GOOGLE_SHEETS_SPREADSHEET_ID
 * - GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(projectRoot, ".env.local") });

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const RAW_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
const DATA_PATH = path.join(projectRoot, "docs", "product-control", "product-control-data.json");

if (!SPREADSHEET_ID) {
  console.error("[sync-product-control] GOOGLE_SHEETS_SPREADSHEET_ID 누락");
  process.exit(1);
}

if (!RAW_KEY) {
  console.error("[sync-product-control] GOOGLE_SERVICE_ACCOUNT_KEY_JSON 누락");
  process.exit(1);
}

let credentials;
try {
  credentials = JSON.parse(RAW_KEY);
} catch (error) {
  console.error("[sync-product-control] GOOGLE_SERVICE_ACCOUNT_KEY_JSON 파싱 실패:", error.message);
  process.exit(1);
}

if (typeof credentials.private_key === "string") {
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

function asCell(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Y" : "N";
  if (value === null || value === undefined) return "";
  return String(value);
}

function rowsFromObjects(headers, rows) {
  return [
    headers.map((header) => header.label),
    ...rows.map((row) => headers.map((header) => asCell(row[header.key]))),
  ];
}

function buildSheetValues(data) {
  const summaryRows = [
    ["생성일", data.generatedAt],
    ["화면 설계 항목", data.summary.screensInDocs],
    ["Next page routes", data.summary.pageRoutes],
    ["API routes", data.summary.apiRoutes],
    ["컴포넌트 파일", data.summary.components],
    ["500줄 이상 컴포넌트", data.summary.largeComponents],
    ["DB 통제 항목", data.summary.dbControlRows],
    ["불일치/정리 백로그", data.summary.gaps],
    ["스크린샷 파일", data.summary.screenshots],
    ["Google Sheets 설정", data.summary.googleSheetsConfigured ? "configured" : "missing"],
    ["Supabase 설정", data.summary.supabaseConfigured ? "configured" : "missing"],
  ];

  return [
    {
      title: "PM_00_요약",
      values: [["항목", "값"], ...summaryRows],
    },
    {
      title: "PM_01_화면통제",
      values: rowsFromObjects([
        { key: "id", label: "ID" },
        { key: "category", label: "구분" },
        { key: "ownerSurface", label: "사용 영역" },
        { key: "route", label: "페이지 경로" },
        { key: "file", label: "파일 경로" },
        { key: "purpose", label: "목적" },
        { key: "components", label: "주요 컴포넌트" },
        { key: "dependencies", label: "DB/외부 의존" },
        { key: "auth", label: "권한/가드" },
        { key: "liveFileStatus", label: "파일 상태" },
        { key: "liveRouteStatus", label: "라우트 연결" },
        { key: "riskFlags", label: "리스크 플래그" },
        { key: "nextReview", label: "다음 액션" },
      ], data.screens),
    },
    {
      title: "PM_02_라우트",
      values: rowsFromObjects([
        { key: "kind", label: "종류" },
        { key: "route", label: "경로" },
        { key: "file", label: "파일" },
        { key: "screenIds", label: "@screen" },
        { key: "docsId", label: "문서 ID" },
        { key: "docsStatus", label: "문서 상태" },
        { key: "category", label: "구분" },
        { key: "ownerSurface", label: "영역" },
        { key: "imports", label: "imports/methods" },
      ], data.routes),
    },
    {
      title: "PM_03_컴포넌트",
      values: rowsFromObjects([
        { key: "file", label: "파일" },
        { key: "component", label: "컴포넌트" },
        { key: "type", label: "유형" },
        { key: "owningRoute", label: "소유 라우트" },
        { key: "lineCount", label: "라인 수" },
        { key: "importCount", label: "import 수" },
        { key: "risk", label: "통제 리스크" },
      ], data.components),
    },
    {
      title: "PM_04_DB스키마",
      values: rowsFromObjects([
        { key: "area", label: "영역" },
        { key: "table", label: "테이블" },
        { key: "field", label: "컬럼/필드" },
        { key: "type", label: "타입" },
        { key: "tsField", label: "TS 필드" },
        { key: "status", label: "연결 상태" },
        { key: "risk", label: "리스크" },
        { key: "decision", label: "PM/기술 결정" },
        { key: "priority", label: "우선순위" },
        { key: "codeRefs", label: "근거" },
      ], data.dbControl),
    },
    {
      title: "PM_05_정리백로그",
      values: rowsFromObjects([
        { key: "id", label: "ID" },
        { key: "priority", label: "우선순위" },
        { key: "type", label: "유형" },
        { key: "title", label: "제목" },
        { key: "symptom", label: "증상" },
        { key: "ownerSurface", label: "영역" },
        { key: "nextAction", label: "다음 액션" },
        { key: "evidence", label: "근거" },
      ], data.gaps),
    },
    {
      title: "PM_06_문서맵",
      values: rowsFromObjects([
        { key: "path", label: "문서/폴더" },
        { key: "role", label: "역할" },
        { key: "overlap", label: "겹침/주의점" },
        { key: "action", label: "정리 액션" },
        { key: "exists", label: "존재" },
      ], data.documents),
    },
    {
      title: "PM_07_동기화",
      values: [
        ["항목", "값"],
        ["화면 설계 기존 sync", data.sheets.existingScreenSyncScript],
        ["제품 통제 sync", data.sheets.productControlSyncScript],
        ["Spreadsheet env key", data.sheets.spreadsheetEnvKey],
        ["설정 상태", data.sheets.configured ? "configured" : "missing"],
        ["화면 설계 sync 명령", data.sheets.lastScreenSyncCommand],
        ["통제 데이터 파일", "docs/product-control/product-control-data.json"],
      ],
    },
  ];
}

async function ensureSheetExists(title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const found = meta.data.sheets?.some((sheet) => sheet.properties?.title === title);
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

const data = JSON.parse(await readFile(DATA_PATH, "utf8"));
const updates = buildSheetValues(data);

for (const update of updates) {
  await ensureSheetExists(update.title);
  await overwriteSheet(update.title, update.values);
  console.log(`[sync-product-control] ${update.title} ${update.values.length} rows`);
}

console.log("[sync-product-control] 완료");
