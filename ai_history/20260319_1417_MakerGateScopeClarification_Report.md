# 2026-03-19 Maker Gate Scope Clarification Report

## 작업 목적

- `MAKER_ACCESS_PASSWORD` 의 의미가 `게임별 비밀번호` 로 오해되지 않도록 문서를 정리한다.
- 현재 구현과 장기 목표를 분리해 이후 회고 시 혼동을 줄인다.

## 반영 내용

- 루트 `README.md` 에 현재 게이트가 `메이커 전체 공통 비밀번호` 라는 점을 명시
- `docs/README.md` 에 접근 제어 문서 해석 기준 추가
- `docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md`
  - 현재 구현 범위
  - 오해 방지 메모
  - 장기 목표와의 차이
- `docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md`
  - Phase 0 한계 명시
  - 표현 규칙 추가
- `docs/plans/20260319_LOCAL_CREATOR_USER_TEST_PLAN.md`
  - 테스트용 안내 문구를 `메이커 전체 공통 비밀번호` 기준으로 수정

## 핵심 정리

- 현재 `MAKER_ACCESS_PASSWORD` 는 게임별 권한 기능이 아니다.
- 현재는 메이커 영역 전체에 공통 비밀번호를 거는 임시 테스트용 출입문이다.
- 장기 목표는 `로그인 + ownerId + visibility + API 권한 체크` 이다.
