/**
 * 메이커 제작/관리 동선에서 쓰는 최소 사용자 식별 정보.
 * 외부 Auth 도입 전까지는 브라우저 쿠키 세션으로만 유지한다.
 */
export interface AppUser {
  id: string;
  displayName: string;
}

/**
 * 로컬 JSON 기반 임시 작업자 레지스트리 레코드.
 * 정식 로그인 전까지는 displayName 과 recovery key(userId)를 묶어 재진입을 돕는다.
 */
export interface MakerUserRecord extends AppUser {
  createdAt: string;
  updatedAt: string;
}

/**
 * 로컬 JSON 기반 메이커 계정 레코드.
 * ownerId 와 1:1로 연결되어 다른 브라우저/기기에서도 같은 작업자로 로그인할 수 있게 한다.
 */
export interface MakerAccountRecord extends AppUser {
  loginId: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}
