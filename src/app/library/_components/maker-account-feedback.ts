/** 계정 관리 화면과 헤더 메뉴에서 공통으로 쓰는 오류 메시지를 query 값에서 고른다. */
export function getMakerAccountErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "invalid_recovery_email":
      return "복구 이메일 형식이 올바르지 않습니다.";
    case "duplicate_recovery_email":
      return "이미 다른 계정이 쓰는 복구 이메일입니다.";
    case "invalid_account_password":
      return "새 비밀번호는 8자 이상이어야 합니다.";
    case "password_mismatch":
      return "비밀번호 확인이 일치하지 않습니다.";
    case "invalid_current_password":
      return "현재 비밀번호가 올바르지 않습니다.";
    case "account_not_found":
      return "계정을 다시 확인해주세요. 잠시 후 다시 시도하면 됩니다.";
    default:
      return null;
  }
}

/** 계정 관리 화면과 헤더 메뉴에서 공통으로 쓰는 성공 메시지를 query 값에서 고른다. */
export function getMakerAccountNoticeMessage(notice: string | undefined): string | null {
  switch (notice) {
    case "recovery_email_saved":
      return "복구 이메일이 저장되었습니다.";
    case "recovery_email_removed":
      return "복구 이메일을 지웠습니다. 이제 비밀번호를 찾을 수 없습니다.";
    case "password_changed":
      return "비밀번호가 변경되었습니다.";
    default:
      return null;
  }
}
