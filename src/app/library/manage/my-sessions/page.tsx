import Link from "next/link";
import { listGames } from "@/lib/game-repository";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import {
  getMaxActiveSessionsPerUser,
  listActiveSessionsByHost,
} from "@/lib/session-repository";
import GuideMenu from "../../_components/GuideMenu";
import MakerAccountMenu from "../../_components/MakerAccountMenu";
import MobileNavMenu from "../../_components/MobileNavMenu";
import {
  getMakerAccountErrorMessage,
  getMakerAccountNoticeMessage,
} from "../../_components/maker-account-feedback";
import MySessionManager from "./_components/MySessionManager";

export const dynamic = "force-dynamic";

const makerAuthGateway = getMakerAuthGateway();

const PHASE_LABELS: Record<string, string> = {
  lobby: "대기실",
  opening: "오프닝",
  vote: "투표",
  ending: "엔딩",
};

function formatSessionPhaseLabel(phase: string, currentSubPhase?: string): string {
  if (phase.startsWith("round-")) {
    const roundNumber = phase.split("-")[1];
    const subPhaseLabel = currentSubPhase === "discussion" ? "토론" : "조사";
    return `Round ${roundNumber} · ${subPhaseLabel}`;
  }

  return PHASE_LABELS[phase] ?? phase;
}

function formatSessionCreatedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type MySessionsPageProps = {
  searchParams?: Promise<{
    notice?: string;
    error?: string;
  }>;
};

export default async function MySessionsPage({ searchParams }: MySessionsPageProps) {
  const resolvedSearchParams = await searchParams;
  const currentUser = await requireCurrentMakerUser("/library/manage/my-sessions");
  const currentAccount = await makerAuthGateway.getAccountById(currentUser.id);
  const games = await listGames();
  const gameMap = new Map(games.map((game) => [game.id, game]));
  const maxSessions = getMaxActiveSessionsPerUser();

  const sessions = (await listActiveSessionsByHost(currentUser.id)).map((session) => ({
    id: session.id,
    gameId: session.gameId,
    gameTitle: gameMap.get(session.gameId)?.title ?? "알 수 없는 게임",
    sessionName: session.sessionName,
    sessionCode: session.sessionCode,
    mode: session.mode,
    phaseLabel: formatSessionPhaseLabel(session.sharedState.phase, session.sharedState.currentSubPhase),
    createdAtLabel: formatSessionCreatedAt(session.createdAt),
    lockedPlayerCount: session.sharedState.characterSlots.filter((slot) => slot.isLocked).length,
    totalPlayerCount: session.sharedState.characterSlots.length,
  }));

  const accountErrorMessage = getMakerAccountErrorMessage(resolvedSearchParams?.error);
  const accountNoticeMessage = getMakerAccountNoticeMessage(resolvedSearchParams?.notice);

  return (
    <div className="min-h-screen bg-dark-950">
      <header className="sticky top-0 z-10 border-b border-dark-800 bg-dark-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/library/manage" className="text-sm text-dark-400 transition-colors hover:text-dark-200">
              ← 게임 관리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-sm font-medium text-dark-100">내 세션 관리</span>
          </div>

          <nav className="flex items-center gap-2">
            {/* 데스크톱: 가이드 */}
            <div className="hidden items-center gap-2 sm:flex">
              <GuideMenu />
            </div>

            {/* 계정 메뉴 */}
            <div className="[&>details>summary]:hidden [&>details>summary]:sm:flex">
              <MakerAccountMenu
                currentUser={currentUser}
                currentAccount={currentAccount}
                nextPath="/library/manage/my-sessions"
                errorMessage={accountErrorMessage}
                noticeMessage={accountNoticeMessage}
              />
            </div>

            {/* 모바일 */}
            <MobileNavMenu
              displayName={currentUser.displayName}
              logoutNextPath="/maker-access"
              showAccountLink
            />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <MySessionManager sessions={sessions} maxSessions={maxSessions} />
      </main>
    </div>
  );
}
