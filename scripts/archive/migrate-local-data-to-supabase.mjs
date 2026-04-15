import {
  applyMigrationPlan,
  buildMigrationPlan,
  formatMigrationPlan,
} from "../lib/local-data-migration.mjs";

/**
 * `--flag=value` 또는 `--flag value` 형태의 CLI 인자를 읽는다.
 *
 * @param {string[]} argv
 * @param {string} flagName
 * @returns {string}
 */
function readFlagValue(argv, flagName) {
  const inline = argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (inline) {
    return inline.slice(flagName.length + 1).trim();
  }

  const index = argv.indexOf(flagName);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1].trim();
  }

  return "";
}

/**
 * dry-run을 기본값으로 두고, `--apply`가 있을 때만 실제 Supabase upsert를 수행한다.
 */
async function main() {
  const argv = process.argv.slice(2);
  const shouldApply = argv.includes("--apply");
  const fallbackOwnerId = readFlagValue(argv, "--fallback-owner-id");

  const plan = await buildMigrationPlan({ fallbackOwnerId });
  console.log(formatMigrationPlan(plan));

  if (!shouldApply) {
    console.log("Dry run complete. Re-run with --apply to execute the import.");
    return;
  }

  const result = await applyMigrationPlan(plan);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
