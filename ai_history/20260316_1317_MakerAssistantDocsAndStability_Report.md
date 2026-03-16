# Maker Assistant Docs And Stability Report

작성 시각: 2026-03-16 13:17 KST

## 1. 작업 배경

메이커용 LLM 제작 도우미를 실제 테스트하는 과정에서 `다음 작업 추천`과 자유 질문 `뭐부터할까` 요청이 에러를 내는 문제가 확인되었다. 이와 함께 이후 작업을 이어가기 쉽게 LLM 관련 소스 코드 근처 문서도 필요해졌다.

## 2. 이번 작업

### 2-1. 응답 파싱 안정화

- `src/app/api/maker-assistant/route.ts`
  - OpenAI 응답을 raw text로 꺼낸 뒤 후처리 파싱하도록 구조 조정
  - 형식이 깨졌을 때 2차 복구 패스 추가
  - `gpt-5-mini`에서 지원하지 않는 `temperature` 사용 제거
- `src/lib/ai/maker-assistant-prompts.ts`
  - JSON 강제 대신 line-based 응답 포맷을 명시적으로 강제
- `src/lib/ai/maker-assistant-schema.ts`
  - JSON 실패 시 line-based 포맷까지 복구 파싱
  - 빈 finding/action/question 필터링 추가

### 2-2. LLM 코드 근처 README 추가

- `src/lib/ai/README.md`
  - 현재 V1 구조 설명
  - 모델 / env 위치
  - 프롬프트 수정 위치
  - 응답 파싱 수정 위치
  - 현재 `No-RAG` 구조와 이후 `RAG + LLM` 확장 방향 정리

### 2-3. 메인 README 반영

- 기술 스택에 OpenAI Responses API 추가
- 현재 구현 상태에 제작 도우미 응답 복구 방식 반영
- 폴더 구조에 `api/maker-assistant`, `src/lib/ai` 반영
- 문서 섹션에 `src/lib/ai/README.md` 링크 추가

## 3. 검증

- `npm run build` 통과
- 실제 로컬 서버 기준 아래 요청 `200` 응답 확인
  - `현재 작업 상태와 검증 힌트를 기준으로 지금 먼저 해야 할 작업을 3개 추천해줘.`
  - `뭐부터할까`

## 4. 현재 판단

현재 메이커 도우미는 `RAG`가 아니라 `현재 편집 중 GamePackage 직접 주입` 구조가 맞다. 이후 `RAG + LLM 기반 NPC 제작`은 별도 검색 계층이 필요한 시점에 분리 구현하는 편이 적절하다.
