import { isValidMakerLoginId, normalizeMakerLoginId } from "@/lib/maker-account";
import { isValidMakerUserId, normalizeMakerUserId } from "@/lib/maker-user";
import { getMakerAuthGateway } from "@/lib/maker-auth-gateway";

export interface MakerIdentityTarget {
  id: string;
  displayName: string;
  matchType: "login_id" | "worker_key";
}

const makerAuthGateway = getMakerAuthGateway();

/**
 * 로그인 ID 또는 작업자 키로 소유권 이전 대상 작업자를 찾는다.
 * displayName 은 중복 가능하므로 일부러 허용하지 않는다.
 */
export function resolveMakerIdentityTarget(rawValue: string): MakerIdentityTarget | null {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  if (isValidMakerLoginId(value)) {
    const account = makerAuthGateway.findAccountByLoginId(normalizeMakerLoginId(value));
    if (!account) {
      return null;
    }

    return {
      id: account.id,
      displayName: account.displayName,
      matchType: "login_id",
    };
  }

  if (isValidMakerUserId(value)) {
    const normalizedUserId = normalizeMakerUserId(value);
    const account = makerAuthGateway.getAccountById(normalizedUserId);
    if (account) {
      return {
        id: account.id,
        displayName: account.displayName,
        matchType: "worker_key",
      };
    }

    const makerUser = makerAuthGateway.getUserById(normalizedUserId);
    if (!makerUser) {
      return null;
    }

    return {
      id: makerUser.id,
      displayName: makerUser.displayName,
      matchType: "worker_key",
    };
  }

  return null;
}
