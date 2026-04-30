#!/usr/bin/env node
/**
 * 화면, 컴포넌트, DB 스키마 통제용 PM 인벤토리 데이터를 생성한다.
 *
 * 이 스크립트는 비밀값을 읽지 않고 환경변수 키 존재 여부만 확인한다.
 * 생성된 JSON은 Excel/Google Sheets 동기화의 단일 로컬 소스로 사용한다.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "docs", "product-control");
const outputPath = path.join(outputDir, "product-control-data.json");

const SOURCE_FILES = [
  "docs/STATUS.md",
  "docs/README.md",
  "docs/screens.json",
  "src/types/game.ts",
  "src/types/session.ts",
  "src/lib/game-repository.ts",
  "src/lib/game-normalizer.ts",
  "src/lib/maker-validation.ts",
  "src/lib/game-publish.ts",
  "supabase/migrations/20260411_000006_normalize_game_content.sql",
  "supabase/migrations/20260411_000007_advanced_gameplay.sql",
  "supabase/migrations/20260411_000008_vote_ending_restructure.sql",
  "supabase/migrations/20260427_000001_vote_question_personal_target.sql",
  "supabase/migrations/20260430_000001_cover_image_zoom.sql",
  "scripts/sync-screens.mjs",
];

const SCREEN_OWNER_BY_ROUTE = [
  [/^\/maker\//, "메이커"],
  [/^\/library\/manage/, "관리"],
  [/^\/library/, "라이브러리"],
  [/^\/play\/.+\/join/, "플레이어 진입"],
  [/^\/play\//, "플레이"],
  [/^\/join/, "플레이어 진입"],
  [/^\/game\//, "공개 커버"],
  [/^\/maker-access/, "인증"],
  [/^\/guide/, "가이드"],
];

const DB_CONTROL_ROWS = [
  {
    area: "게임 메타",
    table: "games",
    field: "cover_asset_id",
    type: "uuid",
    tsField: "GameSettings.coverImageUrl",
    codeRefs: "src/lib/game-repository.ts:29, src/lib/game-repository.ts:127",
    status: "DB-only legacy",
    risk: "앱은 cover_image_url을 사용하고 cover_asset_id는 항상 null로 저장된다.",
    decision: "drop 후보 또는 assets 정규화 재도입 시 FK로 재설계",
    priority: "P2",
  },
  {
    area: "게임 원본 백업",
    table: "game_content",
    field: "content_json / content_json_backup",
    type: "jsonb",
    tsField: "GamePackage",
    codeRefs: "scripts/lib/admin-operations.mjs:163, scripts/transfer-game-owner.mjs:110",
    status: "legacy backup",
    risk: "정규화 이후 런타임은 읽지 않지만 운영/이관 스크립트 일부가 아직 content_json을 만진다.",
    decision: "운영 백업 전용으로 명명하거나 normalized snapshot으로 전환",
    priority: "P1",
  },
  {
    area: "투표 질문",
    table: "game_vote_questions",
    field: "is_primary",
    type: "boolean",
    tsField: "-",
    codeRefs: "supabase/migrations/20260411_000007_advanced_gameplay.sql:35",
    status: "DB-only",
    risk: "엔딩 질문의 대표 여부를 앱이 sortOrder/round로만 판단한다.",
    decision: "삭제하거나 primary ending question 규칙에 실제 연결",
    priority: "P2",
  },
  {
    area: "엔딩 분기",
    table: "game_ending_branches",
    field: "trigger_choice_id",
    type: "text",
    tsField: "EndingBranch.targetChoiceId (deprecated)",
    codeRefs: "src/lib/game-repository.ts:450, src/lib/game-repository.ts:700",
    status: "legacy connected",
    risk: "단수/배열 매핑이 함께 저장되어 분기 매핑의 진실 원천이 둘로 보인다.",
    decision: "trigger_choice_ids로 완전 이관 후 제거",
    priority: "P1",
  },
  {
    area: "장소 잠금",
    table: "game_locations",
    field: "access_condition",
    type: "jsonb",
    tsField: "Location.accessCondition",
    codeRefs: "src/types/game.ts:249, src/app/api/sessions/[sessionId]/locations/[locationId]/unlock/route.ts:39",
    status: "connected but underspecified",
    risk: "현재 단일 조건만 표현 가능하다. STATUS의 OR 조건 다중 지원 백로그와 충돌한다.",
    decision: "access_conditions 배열 또는 child table로 확장",
    priority: "P1",
  },
  {
    area: "단서 잠금",
    table: "game_clues",
    field: "condition",
    type: "jsonb",
    tsField: "Clue.condition",
    codeRefs: "src/types/game.ts:261, src/app/api/sessions/[sessionId]/cards/route.ts:60",
    status: "connected",
    risk: "조건 타입과 대상 ID가 DB에서 제약되지 않아 stale id 검증이 앱에만 있다.",
    decision: "검증 리포트 우선, 필요 시 condition child table 검토",
    priority: "P2",
  },
  {
    area: "승점 조건",
    table: "game_players",
    field: "score_conditions",
    type: "jsonb",
    tsField: "Player.scoreConditions",
    codeRefs: "src/types/game.ts:177, src/lib/score-evaluator.ts:28",
    status: "connected",
    risk: "vote-answer가 voteQuestions/choices를 text id로 참조해 삭제/변경 시 깨질 수 있다.",
    decision: "메이커 검증과 삭제 cascade UX를 먼저 통일",
    priority: "P1",
  },
  {
    area: "세션 상태",
    table: "sessions",
    field: "session_json",
    type: "jsonb",
    tsField: "GameSession",
    codeRefs: "src/lib/session-repository.ts:46, docs/STATUS.md:96",
    status: "intentional aggregate",
    risk: "세션 GET이 큰 JSON과 정규화된 게임 로딩을 함께 건드리면 응답 지연/서버리스 슬롯 이슈가 난다.",
    decision: "요약 컬럼 추가 기준과 retention 정책 분리",
    priority: "P1",
  },
  {
    area: "타임라인",
    table: "player_timeline_entries",
    field: "inactive",
    type: "boolean",
    tsField: "PlayerTimelineEntry.inactive",
    codeRefs: "src/types/game.ts:201, docs/STATUS.md:157",
    status: "connected with UX bug",
    risk: "비활성 토글이 action 텍스트를 삭제하는 현재 UX가 데이터 보존 기대와 충돌한다.",
    decision: "inactive와 action을 독립 상태로 유지",
    priority: "P1",
  },
  {
    area: "투표 질문",
    table: "game_vote_questions",
    field: "personal_target_player_id",
    type: "text",
    tsField: "VoteQuestion.personalTargetPlayerId",
    codeRefs: "src/types/game.ts:404, src/lib/game-repository.ts:475",
    status: "newly connected",
    risk: "최근 누락 버그의 원인 컬럼. 운영 DB 적용 여부와 기존 데이터 보정 확인 필요.",
    decision: "검증 쿼리와 메이커 삭제/이름변경 가드 추가",
    priority: "P1",
  },
  {
    area: "설정",
    table: "games",
    field: "phases / private_chat_config",
    type: "jsonb",
    tsField: "GameRules.phases / GameRules.privateChat",
    codeRefs: "src/types/game.ts:59, src/lib/game-repository.ts:37",
    status: "connected",
    risk: "오프닝 자동 안내와 라운드 페이즈 표시가 이 설정을 기준으로 동작해야 한다.",
    decision: "화면별 안내 텍스트 자동 생성의 입력 계약으로 고정",
    priority: "P2",
  },
];

const GAP_ROWS = [
  {
    id: "GAP-001",
    priority: "P1",
    type: "검증/카운트",
    title: "메이커 제작 상태/카운트 규칙 통일 필요",
    symptom: "신규 필드와 구형 검증 규칙이 섞여 완성도 표시가 믿기 어렵다.",
    evidence: "docs/STATUS.md:156",
    ownerSurface: "메이커 편집",
    nextAction: "maker-validation.ts, game-publish.ts, MakerEditor 표시 규칙을 한 표로 맞춘다.",
  },
  {
    id: "GAP-002",
    priority: "P1",
    type: "DB 모델",
    title: "장소 입장 조건이 단일 JSONB라 OR 조건을 표현하지 못함",
    symptom: "한 장소를 여는 방법을 여러 개 등록할 수 없다.",
    evidence: "src/types/game.ts:249, docs/STATUS.md:169",
    ownerSurface: "메이커 장소/플레이어 조사",
    nextAction: "Location.accessConditions 스펙 확정 후 API/UI/DB migration 동시 진행",
  },
  {
    id: "GAP-003",
    priority: "P1",
    type: "DB 잔해",
    title: "정규화 후 legacy 컬럼/테이블이 운영 스크립트에 남아 있음",
    symptom: "game_content, cover_asset_id, trigger_choice_id, is_primary 같은 진실 원천 불명 항목이 남아 있다.",
    evidence: "src/lib/game-repository.ts:29, scripts/transfer-game-owner.mjs:110",
    ownerSurface: "운영/저장소",
    nextAction: "drop/keep/migrate 판단을 컬럼 단위로 잠그고 migration backlog 생성",
  },
  {
    id: "GAP-004",
    priority: "P1",
    type: "컴포넌트 통제",
    title: "메이커/플레이 핵심 컴포넌트가 과대화됨",
    symptom: "PlayerEditor, PlayerView, LocationEditor, EndingEditor가 화면·상태·검증을 함께 들고 있다.",
    evidence: "src/app/maker/[gameId]/edit/_components/PlayerEditor.tsx, src/app/play/[gameId]/[charId]/_components/PlayerView.tsx",
    ownerSurface: "메이커/플레이",
    nextAction: "도메인 섹션별 subcomponent + pure helper 분리 기준 수립",
  },
  {
    id: "GAP-005",
    priority: "P2",
    type: "설계 자산",
    title: "스크린샷/시각 검증 자산이 비어 있음",
    symptom: "docs/screenshots에 실제 캡처가 없어 PM/디자인 리뷰가 텍스트 중심이다.",
    evidence: "docs/screenshots/README.md",
    ownerSurface: "문서/디자인",
    nextAction: "P-XXX 캡처 규칙으로 핵심 10개 화면부터 채우고 Sheet 이미지 컬럼 자동화",
  },
  {
    id: "GAP-006",
    priority: "P2",
    type: "문서 정합성",
    title: "SPEC와 STATUS의 현재 DB 구조 설명이 다름",
    symptom: "SPEC에는 과거 DB 전환 고려 문맥이 남고 STATUS는 Supabase 정규화 완료 상태다.",
    evidence: "docs/SPEC.md:163, docs/STATUS.md:146",
    ownerSurface: "문서",
    nextAction: "SPEC의 DB/구조 섹션을 현재 Supabase 정규화 기준으로 재작성",
  },
  {
    id: "GAP-007",
    priority: "P2",
    type: "투표/승점",
    title: "vote-answer 승점 조건과 personal vote 질문의 참조 무결성 약함",
    symptom: "질문/선택지 삭제 시 승점 조건이 stale id를 가질 수 있다.",
    evidence: "src/types/game.ts:163, src/types/game.ts:404",
    ownerSurface: "메이커 캐릭터/투표",
    nextAction: "삭제 확인, 자동 정리, 검증 패널 경고를 같은 규칙으로 연결",
  },
];

const DOCUMENT_ROWS = [
  {
    path: "docs/STATUS.md",
    role: "단일 현황 기준",
    overlap: "모든 완료/진행/미착수 판단의 우선 문서",
    action: "유지. 통제 워크북 생성 사실만 추가",
  },
  {
    path: "docs/screens.json",
    role: "화면 설계서 원본",
    overlap: "Google Sheets 기존 `화면 설계서` 탭의 소스",
    action: "유지. PM 통제 워크북은 이를 확장해 읽음",
  },
  {
    path: "docs/screenshots/README.md",
    role: "스크린샷 네이밍 규칙",
    overlap: "화면 설계서의 시각 자산 컬럼과 연결 예정",
    action: "유지. 핵심 화면 캡처 추가 필요",
  },
  {
    path: "docs/SPEC.md",
    role: "전체 명세",
    overlap: "현재 구현과 일부 오래된 DB/구조 설명이 공존",
    action: "정규화 DB 기준으로 별도 업데이트 필요",
  },
  {
    path: "docs/archive/plans/20260319_SUPABASE_SCHEMA_DRAFT.md",
    role: "과거 스키마 초안",
    overlap: "현재 DB와 혼동 가능",
    action: "archive 유지. 현재 판단에는 참조 금지",
  },
  {
    path: "docs/archive/plans/20260410_AI_DB_IMPROVEMENT_PLAN.md",
    role: "정규화 전환 계획",
    overlap: "현재 정규화 구조의 배경",
    action: "archive 유지. DB 정리 시 이력 참조",
  },
  {
    path: "docs/plans/20260413_CLUE_TYPE_REWORK_PLAN.md",
    role: "완료된 단서 타입 리워크 계획",
    overlap: "STATUS에서 완료 처리됨",
    action: "archive 이동 후보",
  },
  {
    path: "docs/plans/20260415_CLUE_REVIEW_SYSTEM_PLAN.md",
    role: "진행/미착수 기능 계획",
    overlap: "AI 단서 검토 신규 기능",
    action: "유지",
  },
  {
    path: "docs/product-control/",
    role: "신규 통제 폴더",
    overlap: "화면/컴포넌트/DB 연결 현황판",
    action: "본 워크북과 JSON 원본 보관",
  },
];

async function readText(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function pathExists(relativePath) {
  try {
    await stat(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, predicate = () => true) {
  const absolute = path.join(projectRoot, dir);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(relative, predicate));
    } else if (predicate(relative)) {
      files.push(relative);
    }
  }

  return files.sort();
}

function routeFromPageFile(file) {
  const route = file
    .replace(/^src\/app/, "")
    .replace(/\/page\.tsx$/, "")
    .replace(/\/route\.ts$/, "");
  return route || "/";
}

function categoryForRoute(route) {
  const matched = SCREEN_OWNER_BY_ROUTE.find(([pattern]) => pattern.test(route));
  return matched?.[1] ?? "공용";
}

function extractScreenIds(source) {
  const match = source.match(/@screen\s+([^—*\n]+)/);
  if (!match) return [];
  return [...match[1].matchAll(/P-\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

function extractImports(source) {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function extractHttpMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)]
    .map((m) => m[1]);
}

function extractExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+function\s+([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+default\s+([A-Z][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function estimateComponentRisk(lineCount, importCount, file) {
  if (lineCount >= 900) return "P1 과대 컴포넌트";
  if (lineCount >= 500) return "P2 분리 검토";
  if (importCount === 0 && file.includes("_components")) return "P3 미사용 후보";
  return "정상";
}

function classifyComponent(file) {
  if (file.startsWith("src/components/ui/")) return "공용 UI primitive";
  if (file.includes("/_components/")) return "route-private component";
  if (file.startsWith("src/app/")) return "app-level component";
  return "shared/domain";
}

function parseEnvKeys(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.slice(0, line.indexOf("=")).trim())
  );
}

function parseTablesFromMigrations(sqlByFile) {
  const tables = new Map();
  for (const [file, sql] of Object.entries(sqlByFile)) {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
      const [, table, body] = match;
      const columns = body
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/,$/, ""))
        .filter((line) => line && !line.startsWith("--"))
        .filter((line) => /^[a-z_]/i.test(line))
        .map((line) => {
          const [name, ...rest] = line.split(/\s+/);
          return { name, definition: rest.join(" ") };
        });
      tables.set(table, { table, source: file, columns });
    }
  }
  return [...tables.values()].sort((a, b) => a.table.localeCompare(b.table));
}

async function buildData() {
  const [screensRaw, envLocalRaw, envRaw] = await Promise.all([
    readText("docs/screens.json"),
    pathExists(".env.local").then((exists) => exists ? readText(".env.local") : ""),
    pathExists(".env").then((exists) => exists ? readText(".env") : ""),
  ]);
  const screensDoc = JSON.parse(screensRaw);
  const screens = screensDoc.screens ?? [];
  const screenById = new Map(screens.map((screen) => [screen.id, screen]));
  const screenByRoute = new Map(screens.map((screen) => [screen.route, screen]));

  const [pageFiles, apiFiles, componentFiles, sourceFiles, migrationFiles] = await Promise.all([
    listFiles("src/app", (file) => file.endsWith("/page.tsx")),
    listFiles("src/app/api", (file) => file.endsWith("/route.ts")),
    listFiles("src", (file) => file.endsWith(".tsx") && !file.endsWith("/page.tsx") && !file.endsWith("/layout.tsx") && !file.endsWith("/loading.tsx")),
    listFiles("src", (file) => /\.(ts|tsx)$/.test(file)),
    listFiles("supabase/migrations", (file) => file.endsWith(".sql")),
  ]);

  const sourceTextEntries = await Promise.all(
    sourceFiles.map(async (file) => [file, await readText(file)])
  );
  const allSourceText = sourceTextEntries.map(([, source]) => source).join("\n");

  const routeRows = [];
  for (const file of pageFiles) {
    const source = await readText(file);
    const route = routeFromPageFile(file);
    const screenIds = extractScreenIds(source);
    const docScreen = screenIds.map((id) => screenById.get(id)).find(Boolean) ?? screenByRoute.get(route);
    routeRows.push({
      kind: "Page",
      route,
      file,
      screenIds: screenIds.join(", "),
      docsId: docScreen?.id ?? "",
      docsStatus: docScreen ? "문서화" : "문서 누락",
      category: docScreen?.category ?? categoryForRoute(route),
      ownerSurface: categoryForRoute(route),
      imports: extractImports(source).join(", "),
    });
  }

  for (const file of apiFiles) {
    const source = await readText(file);
    const route = routeFromPageFile(file).replace(/^\/api/, "/api");
    routeRows.push({
      kind: "API",
      route,
      file,
      screenIds: "",
      docsId: "",
      docsStatus: "API",
      category: "API",
      ownerSurface: "서버",
      imports: extractHttpMethods(source).join(", "),
    });
  }

  const componentRows = [];
  for (const file of componentFiles) {
    const source = await readText(file);
    const lineCount = source.split(/\r?\n/).length;
    const basename = path.basename(file, path.extname(file));
    const importCount = (allSourceText.match(new RegExp(`from\\s+["'][^"']*${basename}["']`, "g")) ?? []).length;
    componentRows.push({
      file,
      component: extractExports(source).join(", ") || basename,
      type: classifyComponent(file),
      lineCount,
      importCount,
      risk: estimateComponentRisk(lineCount, importCount, file),
      owningRoute: file.includes("/_components/")
        ? "/" + file.split("/_components/")[0].replace(/^src\/app\/?/, "")
        : "",
    });
  }

  const enrichedScreens = screens.map((screen) => {
    const fileExists = screen.file && !screen.file.includes("(")
      ? sourceFiles.includes(screen.file)
      : true;
    const liveRoute = routeRows.find((route) => route.docsId === screen.id || route.screenIds.includes(screen.id));
    const riskFlags = [];
    if (!fileExists) riskFlags.push("파일 확인 필요");
    if (!liveRoute && !screen.id.includes(".")) riskFlags.push("page @screen 미연결");
    if ((screen.components ?? []).length === 0 && screen.route.includes("/maker/")) riskFlags.push("컴포넌트 미기재");
    if ((screen.dependencies ?? []).some((dep) => dep.includes("Supabase")) === false && screen.route.includes("/maker")) {
      riskFlags.push("DB 의존 보강 필요");
    }
    return {
      ...screen,
      ownerSurface: categoryForRoute(screen.route),
      liveFileStatus: fileExists ? "OK" : "파일 없음",
      liveRouteStatus: liveRoute ? "연결됨" : screen.id.includes(".") ? "서브모드" : "미확인",
      riskFlags: riskFlags.join(", "),
      nextReview: riskFlags.length > 0 ? "상세 화면 정의 보강" : "정기 리뷰",
    };
  });

  const migrationSqlEntries = await Promise.all(
    migrationFiles.map(async (file) => [file, await readText(file)])
  );
  const migrationSqlByFile = Object.fromEntries(migrationSqlEntries);
  const parsedTables = parseTablesFromMigrations(migrationSqlByFile);
  const envLocalKeys = parseEnvKeys(envLocalRaw);
  const envKeys = parseEnvKeys(envRaw);
  const screenshotFiles = await listFiles("docs/screenshots", (file) => /\.(png|jpg|jpeg|webp|gif)$/i.test(file)).catch(() => []);

  const docsFiles = await listFiles("docs", (file) => file !== "docs/.DS_Store");
  const docsOverlapRows = DOCUMENT_ROWS.map((row) => ({
    ...row,
    exists: row.path.endsWith("/") ? docsFiles.some((file) => file.startsWith(row.path)) : docsFiles.includes(row.path),
  }));

  const generatedAt = new Date();

  return {
    generatedAt: generatedAt.toISOString(),
    date: generatedAt.toISOString().slice(0, 10),
    title: "Murder Mystery Generator Product Control Inventory",
    sourceFiles: SOURCE_FILES,
    summary: {
      screensInDocs: screens.length,
      pageRoutes: pageFiles.length,
      apiRoutes: apiFiles.length,
      components: componentRows.length,
      largeComponents: componentRows.filter((row) => row.lineCount >= 500).length,
      dbControlRows: DB_CONTROL_ROWS.length,
      gaps: GAP_ROWS.length,
      screenshots: screenshotFiles.length,
      googleSheetsConfigured: envLocalKeys.has("GOOGLE_SHEETS_SPREADSHEET_ID") && envLocalKeys.has("GOOGLE_SERVICE_ACCOUNT_KEY_JSON"),
      supabaseConfigured: envKeys.has("SUPABASE_URL") && envKeys.has("SUPABASE_SECRET_KEY"),
    },
    sheets: {
      spreadsheetEnvKey: "GOOGLE_SHEETS_SPREADSHEET_ID",
      existingScreenSyncScript: "scripts/sync-screens.mjs",
      productControlSyncScript: "scripts/sync-product-control-sheets.mjs",
      configured: envLocalKeys.has("GOOGLE_SHEETS_SPREADSHEET_ID") && envLocalKeys.has("GOOGLE_SERVICE_ACCOUNT_KEY_JSON"),
      lastScreenSyncCommand: "npm run sync:screens",
    },
    screens: enrichedScreens,
    routes: routeRows.sort((a, b) => a.kind.localeCompare(b.kind) || a.route.localeCompare(b.route)),
    components: componentRows.sort((a, b) => b.lineCount - a.lineCount),
    dbControl: DB_CONTROL_ROWS,
    dbTables: parsedTables,
    gaps: GAP_ROWS,
    documents: docsOverlapRows,
  };
}

const data = await buildData();
await writeFile(outputPath, JSON.stringify(data, null, 2), "utf8");
console.log(`[product-control] wrote ${path.relative(projectRoot, outputPath)}`);
console.log(`[product-control] screens=${data.summary.screensInDocs} routes=${data.summary.pageRoutes}+${data.summary.apiRoutes} components=${data.summary.components} gaps=${data.summary.gaps}`);
