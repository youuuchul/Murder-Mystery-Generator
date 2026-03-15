# Maker Assistant V1 Report

## 작업 일시

- 2026-03-15 16:20 (Asia/Seoul)

## 구현 범위

- 메이커 편집 화면 우하단 `제작 도우미` 런처 추가
- 우측 드로어형 assistant UI 추가
- 빠른 액션 3종 추가
  - 모순 점검
  - 단서 제안
  - 다음 작업 추천
- 자유 질문 입력 추가
- `/api/maker-assistant` API 추가
- OpenAI Responses API 연동
- 현재 `MakerEditor` 로컬 상태 기준 컨텍스트 전송
- `.env.example` 추가

## 주요 파일

- `src/app/api/maker-assistant/route.ts`
- `src/lib/ai/openai.ts`
- `src/lib/ai/maker-assistant-context.ts`
- `src/lib/ai/maker-assistant-prompts.ts`
- `src/lib/ai/maker-assistant-schema.ts`
- `src/types/assistant.ts`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantDock.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantLauncher.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantDrawer.tsx`
- `src/app/maker/[gameId]/edit/_components/MakerAssistantMessageList.tsx`
- `src/app/maker/[gameId]/edit/_components/useMakerAssistant.ts`
- `src/app/maker/[gameId]/edit/_components/MakerEditor.tsx`
- `.env.example`

## 모델 / API

- 기본 모델: `gpt-5-mini`
- API: OpenAI Responses API
- 응답 형식: JSON-only 응답 + Zod 검증
- 대화 상태: `previousResponseId` 기반 클라이언트 메모리 유지

## 검증

- `npm run build` 통과
- 로컬 런타임 E2E 시도
  - `next dev` / `next start`에서 현재 환경 기준 `.next/server/chunks/vendor-chunks/next.js` 해상도 오류로 최종 HTTP 확인은 막힘
  - assistant 로직 자체는 빌드 통과 상태

## 메모

- 현재 구현은 `제안/검토` 단계까지만 담당
- 단서 자동 삽입, 자동 수정 반영은 아직 없음
- 추후 `gpt-5` 기반 정밀 리뷰 모드나 RAG/NPC 생성으로 확장 가능
