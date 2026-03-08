"use client";

import { useEffect, useRef } from "react";

/**
 * SSE 구독 훅.
 * named event를 핸들러 맵으로 처리.
 * 연결 끊김 시 3초 후 자동 재연결.
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

    function connect() {
      es = new EventSource(url!);

      // named event handlers
      const attach = () => {
        for (const [event, _] of Object.entries(handlersRef.current)) {
          es.addEventListener(event, (e: MessageEvent) => {
            try {
              handlersRef.current[event]?.(JSON.parse(e.data));
            } catch {}
          });
        }
      };
      attach();

      es.onerror = () => {
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [url]);
}
