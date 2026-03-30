# 2026-03-30 라이브러리 / 메이커 접근 분리 현재 상태

## 목적

이 문서는 2026-03-30 기준으로 접근 분리 작업이 어디까지 구현됐는지와,
다음 구현 우선순위를 빠르게 확인하기 위한 상태 문서다.

## 구현 완료

### 1. 메이커 진입 보호

- `MAKER_ACCESS_PASSWORD` 기반 `메이커 전체 공통 비밀번호` 게이트를 계속 쓸 수 있다.
- 리다이렉트는 실제 요청 host/proto 기준으로 만들도록 정리돼 개발 환경에서도 안정적으로 동작한다.

### 2. 작업자 식별

- 임시 작업자 세션 쿠키가 있다.
- 로컬 계정 로그인 ID + 비밀번호 레이어가 추가됐다.
- 현재 작업자 세션에 계정을 연결하면 기존 `ownerId` 를 유지한 채 다른 브라우저와 다른 기기에서 같은 작업자로 다시 로그인할 수 있다.
- 계정을 아직 만들지 않은 경우에는 작업자 키(`userId`) 로 기존 ownerId 를 복구할 수 있다.

### 3. 게임 접근 메타

- `GamePackage.access`
  - `ownerId`
  - `visibility`
  - `publishedAt`
- 기존 로컬 게임 JSON도 정규화 시 access 메타 기본값을 채운다.

### 4. 서버 권한 강제

- 새 게임 생성: 작업자 세션 필수
- 게임 수정/삭제: 소유자만 허용
- 자산 업로드: 소유자만 허용
- 메이커 어시스턴트 호출: 작업자 세션 필수
- 세션 시작:
  - `public`: 누구나 가능
  - `private/draft`: 소유자만 가능

### 5. 라이브러리 / 관리 화면 분리

- `/library`
  - 공개 게임만 노출
  - 비로그인 접근 가능
- `/library/manage`
  - 작업자 세션 필수
  - 내 게임 / 귀속 가능 게임 중심 관리
  - `scope=all` 로 다른 작업자 게임도 읽기 전용 확인 가능

### 6. 공개 상태 전환

- `draft / private / public` 전환 API 가 있다.
- 공개 전 최소 체크리스트 검증이 서버에 있다.
- 관리 카드에서 공개 준비 상태와 누락 항목을 바로 볼 수 있다.

### 7. 소유권 귀속 / 이관

- `claimable` 레거시 게임은 관리 카드에서 현재 작업자로 바로 귀속할 수 있다.
- 현재 소유자는 다른 작업자의 로그인 ID 또는 작업자 키로 ownerId 를 직접 이관할 수 있다.

## 현재 한계

### 1. 정식 Auth 는 아니다

- 현재 계정은 로컬 JSON 저장소 기반이다.
- 다른 브라우저/기기 로그인은 해결됐지만, 운영 환경용 인증 시스템이라고 보기는 어렵다.
- 장기적으로는 Supabase Auth 같은 외부 인증으로 교체해야 한다.

### 2. 대상 작업자 찾기 UX 가 약하다

- 이관 자체는 가능하지만, 대상 로그인 ID 또는 작업자 키를 사용자가 알고 있어야 한다.
- 이름 기반 검색이나 작업자 디렉토리 같은 보조 UX 는 아직 없다.

## 다음 우선순위

1. 로컬 계정 레이어를 Supabase Auth 치환 가능 구조로 정리
2. 대상 작업자 찾기 UX 보강
3. 협업자 모델 준비

## 참고 문서

- [접근 분리 백로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/backlog/20260319_LIBRARY_MAKER_ACCESS_BACKLOG.md)
- [접근 분리 구현 계획](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/docs/plans/20260319_LIBRARY_MAKER_ACCESS_PLAN.md)
- [작업 로그](/Users/youuchul/Documents/github/00_portfolio/Murder-Mystery_Generator/ai_history/20260330_0924_MakerUserSessionAndAccessMeta_Report.md)
