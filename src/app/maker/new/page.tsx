/** @screen P-006 — docs/screens.json 참조 */
import Link from "next/link";
import { requireCurrentMakerUser } from "@/lib/maker-user.server";
import SettingsForm from "./_components/SettingsForm";

export default async function NewGamePage() {
  await requireCurrentMakerUser("/maker/new");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/library/manage" className="text-dark-400 hover:text-dark-200 transition-colors">
              ← 내 게임 관리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-dark-200 font-medium">새 게임 만들기</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.68),rgba(23,15,18,0.94))] p-6 sm:p-8 shadow-[0_20px_48px_rgba(23,15,18,0.4)]">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-dark-50">새 게임 만들기</h1>
            <p className="text-sm text-dark-500 mt-1">
              제목과 소개글만 먼저 정해 주세요. 나머지 설정은 편집 화면에서 이어서 작성합니다.
            </p>
          </div>

          <SettingsForm />
        </div>
      </main>
    </div>
  );
}
