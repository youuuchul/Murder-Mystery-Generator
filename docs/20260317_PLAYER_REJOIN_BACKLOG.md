# 2026-03-17 플레이어 재접속 백로그

## 목적

플레이어가 브라우저 창을 닫거나 참가 페이지로 다시 들어왔을 때,
이미 선택했던 캐릭터로 자연스럽게 복귀하지 못하는 문제를 정리한다.

이 문서는 현재 동작을 확인하고, 어떤 복구 흐름이 필요한지 백로그 수준으로 고정하기 위한 메모다.

## 현재 확인 상태

### 1. 참가 직후 토큰은 브라우저 로컬 스토리지에만 저장됨

- 참가 성공 시 [`src/app/join/[sessionCode]/page.tsx`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/join/%5BsessionCode%5D/page.tsx) 에서 `localStorage.setItem(\`mm_${sessionId}\`, token)` 으로만 토큰을 저장한다.
- 플레이어 화면은 [`src/app/play/[gameId]/[charId]/page.tsx`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/play/%5BgameId%5D/%5BcharId%5D/page.tsx) 에서 같은 키를 읽어 세션 접근을 시도한다.

### 2. 참가 API는 이미 잠긴 슬롯에 대한 재입장을 허용하지 않음

- [`src/app/api/sessions/[sessionId]/join/route.ts`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/api/sessions/%5BsessionId%5D/join/route.ts) 는 `slot.isLocked` 면 바로 `409` 와 `"이미 참가한 슬롯입니다."` 를 반환한다.
- 즉 한번 누군가 들어간 캐릭터는 “같은 사람의 복귀”와 “다른 사람의 중복 참가”를 구분하지 못한다.

### 3. 참가 페이지도 잠긴 슬롯을 모두 비활성화함

- [`src/app/join/[sessionCode]/page.tsx`](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/src/app/join/%5BsessionCode%5D/page.tsx) 에서 `slot.isLocked` 인 캐릭터는 선택 자체가 막혀 있다.
- 따라서 기존 플레이어가 같은 코드로 다시 들어와도 자신의 캐릭터를 다시 고를 수 없다.

## 실제로 발생하는 문제

### 케이스 1. 같은 브라우저인데 참가 링크를 잃어버린 경우

- 토큰은 남아 있어도 사용자가 `/join/<code>` 로 다시 들어오면
  이미 잠긴 슬롯이므로 기존 캐릭터로 복귀할 수 없다.
- 플레이 URL을 정확히 다시 열지 못하면 사실상 재입장이 막힌다.

### 케이스 2. 다른 브라우저 / 다른 기기 / 저장소 초기화

- 토큰이 로컬 스토리지에만 있으므로 복구 수단이 없다.
- 참가 슬롯은 잠겨 있고, 서버는 재입장을 허용하지 않아 영구적으로 막힐 수 있다.

### 케이스 3. GM 입장에서도 복구 지원 수단이 없음

- 현재는 특정 슬롯의 토큰 재발급, 강제 복귀, 슬롯 해제 같은 관리 도구가 없다.
- 참가자 이탈이 한 번 발생하면 세션 운영이 불안정해진다.

## 후속 작업 방향

### 1. 같은 브라우저 재접속 자동 복구

- 참가 페이지에서 `sessionId` 기준 기존 `mm_<sessionId>` 토큰을 먼저 확인
- 토큰이 유효하면 해당 플레이어/캐릭터를 찾아 즉시 플레이 화면으로 리다이렉트
- 즉 `/join/<code>` 는 “새 참가”뿐 아니라 “기존 참가 복귀”도 담당하도록 확장

### 2. 서버 차원의 재입장 API 필요

- 단순 `join` 과 별도로 `rejoin` 또는 `resume` 성격의 흐름 필요
- 서버가 토큰 유효성 또는 복구 키를 검증한 뒤 기존 `playerState` 를 다시 연결해야 함
- “잠긴 슬롯이라서 무조건 거절” 구조를 “본인 복귀인지 여부 판단” 구조로 변경해야 함

### 3. 토큰 분실 대비 복구 정책 정의

- 최소안
  - GM이 특정 슬롯의 토큰을 재발급
  - 또는 슬롯 잠금을 해제하고 다시 참가시키기
- 확장안
  - 플레이어용 복구 코드
  - 이름 + 캐릭터 + 세션 코드 기반 재인증
  - 일회용 재접속 링크

### 4. GM 보드 복구 기능

- 플레이어 슬롯 카드에서 아래 액션 검토
  - 재접속 링크 복사
  - 토큰 재발급
  - 슬롯 잠금 해제
- 최소한 세션 중 한 명이 이탈했을 때 GM이 수습할 수 있어야 함

## 구현 단위 제안

### 1단계

- 참가 페이지에서 기존 토큰 자동 감지
- 유효 토큰이면 플레이 화면으로 자동 이동

### 2단계

- 서버에 재접속/복구 API 추가
- 기존 잠긴 슬롯도 복구 조건에서는 허용

### 3단계

- GM 보드에 재접속 지원 액션 추가

## 우선순위

- 높음
- 실제 플레이 중 세션 안정성에 직접 영향이 있고, 한 번 막히면 게임 진행 자체가 끊긴다.
