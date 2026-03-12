"use client";

import { useEffect, useRef } from "react";

/**
 * SSE 구독 훅.
 * - named event를 핸들러 맵으로 처리
 * - 연결 끊김 시 3초 후 자동 재연결
 * - 15초 이상 아무 이벤트/ping 이벤트도 없으면 dead connection으로 판단하고 재연결
 *   (Cloudflare 등 프록시가 스트림을 끊지 않고 버퍼링하는 경우 대응)
 */
export function useSSE(
  url: string | null,
  handlers: Record<string, (data: unknown) => void>
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;

    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let deadTimer: ReturnType<typeof setTimeout>;

    // 마지막 수신 시각 갱신 + dead timer 리셋
    function resetDeadTimer() {
      clearTimeout(deadTimer);
      // 15초 동안 아무 신호 없으면 강제 재연결
      deadTimer = setTimeout(() => {
        es.close();
        reconnectTimer = setTimeout(connect, 1000);
      }, 15000);
    }

    function connect() {
      es = new EventSource(url!);

      // default message와 서버 keepalive ping 이벤트 모두 수신 신호로 간주한다.
      es.addEventListener("message", resetDeadTimer);
      es.addEventListener("ping", resetDeadTimer);

      // named event handlers
      for (const [event] of Object.entries(handlersRef.current)) {
        es.addEventListener(event, (e: MessageEvent) => {
          resetDeadTimer();
          try {
            handlersRef.current[event]?.(JSON.parse(e.data));
          } catch {}
        });
      }

      es.onopen = () => {
        resetDeadTimer();
      };

      es.onerror = () => {
        clearTimeout(deadTimer);
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };

      resetDeadTimer();
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      clearTimeout(deadTimer);
      es?.close();
    };
  }, [url]);
}
