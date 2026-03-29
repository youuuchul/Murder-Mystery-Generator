import Link from "next/link";
import StepWizard from "./_components/StepWizard";
import SettingsForm from "./_components/SettingsForm";

export default function NewGamePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,100,91,0.08),transparent_18%),radial-gradient(circle_at_bottom_right,rgba(42,13,18,0.12),transparent_28%),linear-gradient(180deg,rgba(15,9,12,1),rgba(23,15,18,1))]">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 border-b border-dark-700 bg-[rgba(15,9,12,0.88)] backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/library" className="text-dark-400 hover:text-dark-200 transition-colors">
              ← 라이브러리
            </Link>
            <span className="text-dark-700">|</span>
            <span className="text-dark-200 font-medium">새 게임 만들기</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* 스텝 위자드 */}
        <div className="mb-10 rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.62),rgba(23,15,18,0.9))] p-5 shadow-[0_18px_40px_rgba(23,15,18,0.35)]">
          <StepWizard currentStep={1} />
        </div>

        {/* 단계별 콘텐츠 */}
        <div className="rounded-2xl border border-dark-700/80 bg-[linear-gradient(180deg,rgba(42,46,47,0.68),rgba(23,15,18,0.94))] p-6 shadow-[0_20px_48px_rgba(23,15,18,0.4)] sm:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-dark-50">기본 설정</h2>
            <p className="text-sm text-dark-500 mt-1">
              게임의 기본 정보를 설정합니다. 이후 단계에서 언제든 수정할 수 있습니다.
            </p>
          </div>

          <SettingsForm />
        </div>
      </main>
    </div>
  );
}
