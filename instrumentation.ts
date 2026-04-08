/**
 * Next.js 서버 런타임 부팅 시 Langfuse OpenTelemetry exporter 를 초기화한다.
 * 메이커 어시스턴트 라우트가 첫 요청 전에 tracing provider 를 붙이는 용도다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startLangfuseTracing } = await import("@/lib/ai/langfuse");
  await startLangfuseTracing();
}
