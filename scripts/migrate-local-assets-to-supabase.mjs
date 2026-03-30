import {
  applyLocalAssetMigration,
  buildLocalAssetMigrationPlan,
  formatLocalAssetMigrationPlan,
} from "./lib/local-asset-migration.mjs";

/**
 * 로컬 game asset 파일을 Supabase Storage로 복사한다.
 * 기본은 dry-run이며, `--apply`일 때만 실제 upload를 수행한다.
 */
async function main() {
  const shouldApply = process.argv.slice(2).includes("--apply");
  const plan = buildLocalAssetMigrationPlan();

  console.log(formatLocalAssetMigrationPlan(plan));

  if (!shouldApply) {
    console.log("Dry run complete. Re-run with --apply to upload assets.");
    return;
  }

  const result = await applyLocalAssetMigration(plan);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
