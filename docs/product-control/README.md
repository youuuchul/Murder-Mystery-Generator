# Product Control

이 폴더는 화면, 컴포넌트, DB 스키마 연결 상태를 PM/개발자가 함께 볼 수 있게 묶은 통제 자료를 둔다.

- `product-control-data.json`: 로컬 단일 데이터 소스. `npm run control:inventory`로 재생성한다.
- `MMG_Product_Control_20260428.xlsx`: 화면/라우트/컴포넌트/DB/문서 중복/정리 백로그를 묶은 실무형 워크북.
- Google Sheets PM 탭: `npm run sync:product-control`로 `PM_00_요약`부터 `PM_07_동기화`까지 덮어쓴다.

기존 `docs/screens.json`은 계속 화면 설계서 원본으로 유지한다. 이 폴더의 자료는 그 위에 실제 코드와 DB 연결 상태를 덧붙이는 관리 레이어다.

## 원본 경계

- 이 폴더는 제품 데이터의 원본이 아니다. 운영 데이터의 원본은 Supabase다.
- 이 폴더는 화면 정의의 원본이 아니다. 화면 ID와 기본 목적의 원본은 `docs/screens.json`이다.
- 이 폴더는 DB 스키마의 원본이 아니다. DB 원본은 `supabase/migrations/*`와 실제 Supabase schema다.
- 이 폴더는 여러 원본을 읽어 PM/기획자가 한눈에 볼 수 있게 만든 재생성 가능한 뷰다.
