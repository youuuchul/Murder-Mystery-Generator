# LLM Maker Assistant Plan Report

## 작업 일시

- 2026-03-15 15:26 (Asia/Seoul)

## 요청

- 다음 백로그인 `LLM 기반 시나리오 제작 도우미`의 구체적인 구현 문서화
- 범위:
  - 단서-타임라인 오류/모순 검증
  - 배경/캐릭터 기반 단서 제안
  - 작업 현황 기반 다음 작업 추천
  - 우하단 팝업형 챗봇 UI 구상
  - 기능, 언어, 아키텍처, 필요한 파일, env/API 키, 모델 선택 정리

## 확인한 내용

- 현재 메이커는 `MakerEditor`에서 `game`, `currentStep`, `validation`을 모두 들고 있으므로, 저장 전 편집 상태를 그대로 assistant에 넘기기 좋음
- `validateMakerGame()`가 이미 deterministic validation을 제공하므로, LLM은 의미적 모순 검토에 집중시키는 구조가 적합함
- `openai` SDK는 아직 `package.json`에 없음
- `OPENAI_API_KEY`는 로컬 `.env`에 이미 존재함

## 모델 확인

2026-03-15에 OpenAI Responses API로 `gpt-5-mini` 실제 호출 확인.

- HTTP `200`
- 응답 모델 문자열: `gpt-5-mini-2025-08-07`
- 간단 입력에 정상 응답 반환

즉, 현재 환경에서는 `gpt-5-mini`를 V1 기본 모델로 사용할 수 있음.

## 남긴 문서

- `docs/LLM_MAKER_ASSISTANT_PLAN.md`

## 문서 핵심 결론

- V1은 RAG 없이 진행
- 위치는 `/maker/[gameId]/edit` 화면 우하단 런처 + 우측 드로어
- `MakerEditor`의 현재 메모리 상태를 직접 컨텍스트로 사용
- OpenAI `Responses API` + `gpt-5-mini` + structured output 조합 권장
- 필요한 신규 파일과 단계별 구현 순서를 문서에 명시
