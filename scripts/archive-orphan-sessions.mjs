import { archiveLocalOrphanSessions, listLocalOrphanSessions } from "./lib/local-data-migration.mjs";

/**
 * 로컬 세션 중 참조 게임이 없는 orphan 세션을 backup 폴더로 이동한다.
 * 기본 동작은 즉시 archive 이며, 이동된 세션 목록과 대상 경로를 출력한다.
 */
function main() {
  const orphanSessions = listLocalOrphanSessions();

  if (orphanSessions.length === 0) {
    console.log(JSON.stringify({ archivedCount: 0, archivedSessions: [] }, null, 2));
    return;
  }

  const result = archiveLocalOrphanSessions();
  console.log(JSON.stringify(result, null, 2));
}

main();
