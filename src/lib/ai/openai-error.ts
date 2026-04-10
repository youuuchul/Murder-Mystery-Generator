import "server-only";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
  PermissionDeniedError,
} from "openai";

/**
 * OpenAI API 에러를 사용자 친화적 메시지와 HTTP 상태 코드로 변환한다.
 * 메이커 AI, AI 플레이어 등 모든 LLM 호출 경로에서 공용으로 사용한다.
 */
export function classifyOpenAIError(error: unknown): {
  message: string;
  status: number;
  isApiIssue: boolean;
} {
  // 인증 실패 (401) — API 키 만료/잘못됨
  if (error instanceof AuthenticationError) {
    return {
      message: "AI API 인증에 실패했습니다. API 키가 만료되었거나 잘못되었을 수 있습니다.",
      status: 503,
      isApiIssue: true,
    };
  }

  // 권한 거부 (403) — 모델 접근 불가, 프로젝트 제한
  if (error instanceof PermissionDeniedError) {
    return {
      message: "AI API 접근이 거부되었습니다. 모델 또는 프로젝트 권한을 확인해 주세요.",
      status: 503,
      isApiIssue: true,
    };
  }

  // 요청 한도 초과 (429) — rate limit 또는 토큰 사용량 초과
  if (error instanceof RateLimitError) {
    const isQuota = (error.message ?? "").toLowerCase().includes("quota")
      || (error.message ?? "").toLowerCase().includes("insufficient");

    return {
      message: isQuota
        ? "AI API 사용 한도를 초과했습니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요."
        : "AI 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      status: 429,
      isApiIssue: true,
    };
  }

  // 잘못된 요청 (400) — 모델 미지원, 파라미터 오류
  if (error instanceof BadRequestError) {
    return {
      message: "AI 요청 형식에 문제가 있습니다. 다시 시도해 주세요.",
      status: 400,
      isApiIssue: false,
    };
  }

  // 연결 실패 — 네트워크 오류
  if (error instanceof APIConnectionError || error instanceof APIConnectionTimeoutError) {
    return {
      message: "AI 서버에 연결할 수 없습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.",
      status: 503,
      isApiIssue: true,
    };
  }

  // OpenAI 내부 오류 (500)
  if (error instanceof InternalServerError) {
    return {
      message: "AI 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      status: 502,
      isApiIssue: true,
    };
  }

  // 알 수 없는 에러
  return {
    message: error instanceof Error ? error.message : "AI 응답 생성에 실패했습니다.",
    status: 500,
    isApiIssue: false,
  };
}

/** OpenAI API 에러인지 (사용자 조작 불가, 관리자 대응 필요) 판별한다. */
export function isOpenAIApiError(error: unknown): boolean {
  return error instanceof AuthenticationError
    || error instanceof PermissionDeniedError
    || error instanceof RateLimitError
    || error instanceof APIConnectionError
    || error instanceof APIConnectionTimeoutError
    || error instanceof InternalServerError;
}
