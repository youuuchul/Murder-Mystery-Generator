/**
 * broadcaster.ts
 * SSE 구독자 레지스트리.
 * globalThis에 저장하여 Next.js dev HMR 시 모듈 리로드에도 유지.
 */

type SSEController = ReadableStreamDefaultController<Uint8Array>;

declare global {
  // eslint-disable-next-line no-var
  var __sse_registry: Map<string, Set<SSEController>> | undefined;
}

// HMR에서도 살아남는 singleton
const registry: Map<string, Set<SSEController>> =
  (globalThis.__sse_registry ??= new Map());

const encoder = new TextEncoder();

export function subscribe(sessionId: string, ctrl: SSEController): void {
  if (!registry.has(sessionId)) registry.set(sessionId, new Set());
  registry.get(sessionId)!.add(ctrl);
}

export function unsubscribe(sessionId: string, ctrl: SSEController): void {
  const set = registry.get(sessionId);
  if (!set) return;
  set.delete(ctrl);
  if (set.size === 0) registry.delete(sessionId);
}

export function broadcast(sessionId: string, eventType: string, data: unknown): void {
  const clients = registry.get(sessionId);
  if (!clients || clients.size === 0) return;
  const payload = encoder.encode(
    `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
  );
  for (const ctrl of [...clients]) {
    try {
      ctrl.enqueue(payload);
    } catch {
      clients.delete(ctrl);
    }
  }
}

export function connectionCount(sessionId: string): number {
  return registry.get(sessionId)?.size ?? 0;
}
