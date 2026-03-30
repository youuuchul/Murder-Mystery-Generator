import { createLocalDataBackup } from "./lib/local-data-migration.mjs";

/**
 * 로컬 게임/세션 데이터를 timestamp 백업으로 복사한다.
 * 실제 Supabase import 전에 수동 실행하거나, import script 내부 자동 백업에도 재사용한다.
 */
function main() {
  const { backupDir, manifest } = createLocalDataBackup();
  console.log(JSON.stringify({ backupDir, manifest }, null, 2));
}

main();
