import { hmacSha256Hex, randomToken, safeEqual } from "./memberPaymentsCrypto";

const MOBILE_PREFIX = "MATM1";
const WALLET_PREFIX = "MATW1";

export type ParsedRewardQr =
  | {
      kind: "mobile";
      credentialId: string;
      tokenId: string;
      expiresAt: number;
    }
  | { kind: "wallet"; credentialId: string };

export function getRewardsQrSecret(): string | null {
  const value = process.env.REWARDS_QR_SIGNING_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

export function newCredentialId(): string {
  return randomToken(24);
}

export async function signWalletQr(
  credentialId: string,
  secret = getRewardsQrSecret(),
): Promise<string> {
  if (!secret) throw new Error("REWARDS_QR_CONFIGURATION_REQUIRED");
  const message = `${WALLET_PREFIX}.${credentialId}`;
  const signature = await hmacSha256Hex(secret, message);
  return `${message}.${signature}`;
}

export async function signMobileQr(
  credentialId: string,
  expiresAt: number,
  secret = getRewardsQrSecret(),
): Promise<{ payload: string; tokenId: string }> {
  if (!secret) throw new Error("REWARDS_QR_CONFIGURATION_REQUIRED");
  const tokenId = randomToken(12);
  const message = `${MOBILE_PREFIX}.${credentialId}.${tokenId}.${expiresAt}`;
  const signature = await hmacSha256Hex(secret, message);
  return { payload: `${message}.${signature}`, tokenId };
}

export async function signApplePassAuthenticationToken(
  serialNumber: string,
  secret = getRewardsQrSecret(),
): Promise<string> {
  if (!secret) throw new Error("REWARDS_QR_CONFIGURATION_REQUIRED");
  return await hmacSha256Hex(secret, `APPLEPASS.${serialNumber}`);
}

export async function parseAndVerifyRewardQr(
  payload: string,
  secret = getRewardsQrSecret(),
): Promise<ParsedRewardQr | null> {
  if (!secret || payload.length > 512) return null;
  const parts = payload.trim().split(".");
  if (parts[0] === WALLET_PREFIX && parts.length === 3) {
    const message = `${parts[0]}.${parts[1]}`;
    const expected = await hmacSha256Hex(secret, message);
    if (!safeEqual(expected, parts[2])) return null;
    return { kind: "wallet", credentialId: parts[1] };
  }
  if (parts[0] === MOBILE_PREFIX && parts.length === 5) {
    const expiresAt = Number(parts[3]);
    if (!Number.isSafeInteger(expiresAt)) return null;
    const message = parts.slice(0, 4).join(".");
    const expected = await hmacSha256Hex(secret, message);
    if (!safeEqual(expected, parts[4])) return null;
    return {
      kind: "mobile",
      credentialId: parts[1],
      tokenId: parts[2],
      expiresAt,
    };
  }
  return null;
}
