"use client";

/**
 * details 요소 내부에서 닫기 버튼 역할을 하는 클라이언트 컴포넌트.
 * 가장 가까운 조상 details 요소를 찾아 open = false로 설정한다.
 */
export default function DetailsCloseButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        const details = (e.target as HTMLElement).closest("details");
        if (details) details.open = false;
      }}
      aria-label="닫기"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
      </svg>
    </button>
  );
}
