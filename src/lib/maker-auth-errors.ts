/**
 * 이미 사용 중인 로그인 ID로 계정을 만들려 할 때 쓰는 도메인 오류.
 * route 계층은 이 오류를 사용자용 중복 안내로 바꿔서 보여준다.
 */
export class DuplicateMakerLoginIdError extends Error {
  constructor(loginId: string) {
    super(`Maker login ID "${loginId}" is already in use.`);
    this.name = "DuplicateMakerLoginIdError";
  }
}

/**
 * 하나의 작업자 세션이나 계정에 이미 다른 메이커 계정이 연결된 경우의 도메인 오류.
 */
export class MakerAccountAlreadyLinkedError extends Error {
  constructor(userId: string) {
    super(`Maker account is already linked to user "${userId}".`);
    this.name = "MakerAccountAlreadyLinkedError";
  }
}

/** 오류가 로그인 ID 중복인지 안전하게 판별한다. */
export function isDuplicateMakerLoginIdError(error: unknown): error is DuplicateMakerLoginIdError {
  return error instanceof DuplicateMakerLoginIdError;
}

/** 오류가 기존 계정 연결 충돌인지 안전하게 판별한다. */
export function isMakerAccountAlreadyLinkedError(
  error: unknown
): error is MakerAccountAlreadyLinkedError {
  return error instanceof MakerAccountAlreadyLinkedError;
}
