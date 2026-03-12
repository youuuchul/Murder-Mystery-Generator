import Link from "next/link";
import StepWizard from "./_components/StepWizard";
import SettingsForm from "./_components/SettingsForm";

export default function NewGamePage() {
  return (
    <div className="min-h-screen bg-dark-950">
      {/* 헤더 */}
      <header className="border-b border-dark-800 bg-dark-950/80 backdrop-blur sticky top-0 z-10">
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
        <div className="mb-10 bg-dark-900 border border-dark-800 rounded-2xl p-5">
          <StepWizard currentStep={1} />
        </div>

        {/* 단계별 콘텐츠 */}
        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 sm:p-8">
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
