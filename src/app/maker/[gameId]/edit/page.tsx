import { Suspense } from "react";
import Link from "next/link";
import MakerEditorLoader, {
  MakerEditorLoaderSkeleton,
} from "./_components/MakerEditorLoader";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ gameId: string }> };

/**
 * 제작 편집 페이지.
 * 헤더 쉘(back link 등)을 즉시 렌더하고, getGame + 권한 확인이 필요한
 * 에디터 본체는 Suspense로 스트리밍한다.
 * 초기 경로 진입 시 loading.tsx가 먼저 표시되다가 이 쉘로 교체된다.
 */
export default async function EditGamePage({ params }: Props) {
  const { gameId } = await params;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/library/manage" className="text-dark-400 hover:text-dark-200 transition-colors text-sm">
              ← 내 게임 관리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-dark-300 text-sm">편집 화면</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Suspense fallback={<MakerEditorLoaderSkeleton />}>
          <MakerEditorLoader gameId={gameId} />
        </Suspense>
      </main>
    </div>
  );
}
