import { NextResponse } from "next/server";
import { isLangfuseTracingEnabled } from "@/lib/ai/langfuse";

/**
 * GET /api/debug/langfuse-check — Langfuse 환경변수 진단 (프로덕션에서 제거 예정)
 * 키 값 자체는 노출하지 않고, 설정 상태와 프로젝트 정보만 확인한다.
 */
export async function GET() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim();

  if (!publicKey || !secretKey || !baseUrl) {
    return NextResponse.json({
      status: "missing_keys",
      hasPublicKey: Boolean(publicKey),
      hasSecretKey: Boolean(secretKey),
      hasBaseUrl: Boolean(baseUrl),
      tracingEnabled: isLangfuseTracingEnabled(),
    });
  }

  // Langfuse API로 프로젝트 확인
  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    const response = await fetch(`${baseUrl}/api/public/projects`, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!response.ok) {
      return NextResponse.json({
        status: "auth_failed",
        httpStatus: response.status,
        publicKeyPrefix: publicKey.slice(0, 12),
        baseUrl,
      });
    }

    const data = await response.json() as {
      data?: Array<{ id: string; name: string; organization?: { name: string } }>;
    };

    return NextResponse.json({
      status: "ok",
      tracingEnabled: isLangfuseTracingEnabled(),
      publicKeyPrefix: publicKey.slice(0, 12),
      baseUrl,
      projects: data.data?.map((p) => ({
        name: p.name,
        org: p.organization?.name,
      })),
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
