export type MakerRole = "creator" | "admin";

/**
 * 메이커 제작/관리 동선에서 쓰는 최소 사용자 식별 정보.
 * 외부 Auth 도입 전까지는 브라우저 쿠키 세션으로만 유지한다.
 */
export interface AppUser {
  id: string;
  displayName: string;
  role: MakerRole;
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
 * provider 구현과 무관하게 메이커 계정 식별에 공통으로 쓰는 최소 정보다.
 */
export interface MakerAccountIdentity extends AppUser {
  loginId: string;
  recoveryEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 로컬 JSON 기반 메이커 계정 레코드.
 * Supabase 전환 전까지는 비밀번호 해시 필드가 로컬 저장소에만 남아 있다.
 */
export interface MakerAccountRecord extends MakerAccountIdentity {
  passwordSalt: string;
  passwordHash: string;
}
