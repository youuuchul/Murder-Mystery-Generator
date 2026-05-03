import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 토글/버튼 클릭으로 화면 layout이 변동돼도 클릭한 element의 viewport 내 위치를 보존하는 hook.
 *
 * ## 사용
 * ```tsx
 * const captureScrollAnchor = useScrollAnchor();
 * <button onClick={(e) => {
 *   captureScrollAnchor(e);
 *   doStateChange();
 * }}>...</button>
 * ```
 *
 * ## 동작
 * 1. 클릭 시점: `captureScrollAnchor(e)` 가 click element의 viewport top 위치를 ref에 기록.
 * 2. React commit 후 `useLayoutEffect` 가 새 top 위치를 측정.
 * 3. 변동(delta) 만큼 `window.scrollBy` 로 보정 → 사용자 viewport 안 element가 같은 자리에 머묾.
 * 4. paint 전 시점이라 깜빡임 없음.
 *
 * ## 적용 대상
 * 메이커 편집기에서 클릭 한 번에 layout이 크게 변동되는 동작:
 * - validation issue 트리거하는 토글(작가 후기, 타임라인 enabled, 2차 투표 등)
 * - 항목 추가/삭제 버튼(NPC, 장소, 단서, 캐릭터, 엔딩 분기 등)
 * - 옵션 변경(투표 대상 [범인 지정 따름 / 커스텀 선택지])
 *
 * `MakerEditor` validation panel의 추가/제거가 가장 흔한 layout shift 원인이지만,
 * 같은 카드 안 펼침/접힘도 처리되어 일관된 사용 경험을 제공한다.
 */
/**
 * 인자로 `MouseEvent`를 전달하면 `currentTarget`(클릭 element)을 anchor로 capture한다.
 * 그러나 클릭 element가 삭제되는 동작(예: 트리거/항목 삭제)에서는 capture 시점 element가 DOM에서 분리되어
 * 보정이 망가진다. 이때는 stable element(컨테이너 등)를 직접 인자로 넘기면 된다.
 */
export function useScrollAnchor() {
  const beforeRef = useRef<{ el: HTMLElement; top: number } | null>(null);

  useLayoutEffect(() => {
    const before = beforeRef.current;
    if (!before) return;
    beforeRef.current = null;
    if (!before.el.isConnected) return; // capture한 element가 commit 후 사라진 경우 보정 skip
    const afterTop = before.el.getBoundingClientRect().top;
    const delta = afterTop - before.top;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy({ top: delta, behavior: "auto" });
    }
  });

  return useCallback((target: HTMLElement | React.MouseEvent<HTMLElement> | null | undefined) => {
    if (!target) return;
    const el: HTMLElement | null =
      target instanceof HTMLElement ? target : (target.currentTarget as HTMLElement | null);
    if (!el) return;
    beforeRef.current = { el, top: el.getBoundingClientRect().top };
  }, []);
}
