import crypto from "crypto";
import type { MakerAccountRecord } from "@/types/auth";

const MAKER_LOGIN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{2,31})$/;
const MAKER_ACCOUNT_PASSWORD_MIN_LENGTH = 8;
const MAKER_RECOVERY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 작업자 계정 로그인 ID 를 비교/저장용 형태로 정리한다. */
export function normalizeMakerLoginId(value: string): string {
  return value.trim().toLowerCase();
}

/** 작업자 계정 로그인 ID 형식을 검사한다. */
export function isValidMakerLoginId(value: string): boolean {
  return MAKER_LOGIN_ID_PATTERN.test(normalizeMakerLoginId(value));
}

/** 계정 비밀번호 최소 조건을 검사한다. */
export function isValidMakerAccountPassword(value: string): boolean {
  return value.length >= MAKER_ACCOUNT_PASSWORD_MIN_LENGTH;
}

/** 복구 이메일을 비교/저장용 형태로 정리한다. */
export function normalizeMakerRecoveryEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** 복구 이메일이 현재 허용 형식인지 검사한다. */
export function isValidMakerRecoveryEmail(value: string): boolean {
  const normalizedEmail = normalizeMakerRecoveryEmail(value);
  return normalizedEmail.length === 0 || MAKER_RECOVERY_EMAIL_PATTERN.test(normalizedEmail);
}

/** UI에 그대로 노출하지 않도록 복구 이메일을 일부만 마스킹한다. */
export function maskMakerRecoveryEmail(value: string | null | undefined): string {
  const normalizedEmail = normalizeMakerRecoveryEmail(value ?? "");
  if (!normalizedEmail) {
    return "";
  }

  const [localPart, domain = ""] = normalizedEmail.split("@");
  const [domainName, ...domainSuffixParts] = domain.split(".");
  const domainSuffix = domainSuffixParts.join(".");
  const maskedLocalPart = localPart.length <= 2
    ? `${localPart[0] ?? "*"}*`
    : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}`;
  const maskedDomainName = domainName.length <= 2
    ? `${domainName[0] ?? "*"}*`
    : `${domainName.slice(0, 2)}${"*".repeat(Math.max(1, domainName.length - 2))}`;

  return `${maskedLocalPart}@${maskedDomainName}${domainSuffix ? `.${domainSuffix}` : ""}`;
}

/**
 * 계정 비밀번호를 scrypt 해시로 변환한다.
 * 로컬 JSON 저장 구조에서도 평문 비밀번호를 남기지 않기 위한 최소 보호층이다.
 */
export function hashMakerAccountPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex")
): Pick<MakerAccountRecord, "passwordSalt" | "passwordHash"> {
  return {
    passwordSalt: salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString("hex"),
  };
}

/** 저장된 계정 레코드와 입력 비밀번호가 일치하는지 검사한다. */
export function verifyMakerAccountPassword(
  password: string,
  account: Pick<MakerAccountRecord, "passwordSalt" | "passwordHash">
): boolean {
  const hashedPassword = crypto.scryptSync(password, account.passwordSalt, 64).toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hashedPassword, "hex"),
    Buffer.from(account.passwordHash, "hex")
  );
}
