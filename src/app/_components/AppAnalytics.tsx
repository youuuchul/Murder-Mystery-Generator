"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * 참가 링크에 포함된 세션 코드를 그대로 수집하지 않도록
 * join 경로를 일반화한 뒤 Analytics 이벤트를 전송한다.
 */
function sanitizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);

  if (url.pathname.startsWith("/join/")) {
    url.pathname = "/join/[sessionCode]";
  }

  return {
    ...event,
    url: url.toString(),
  };
}

/**
 * Analytics는 클라이언트 컴포넌트라서 beforeSend 핸들러도
 * 같은 경계 안에서 정의해 서버/클라이언트 직렬화 오류를 피한다.
 */
export default function AppAnalytics() {
  return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
