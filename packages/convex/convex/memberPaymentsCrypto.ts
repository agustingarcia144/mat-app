/**
 * Envelope encryption for gym payment credentials.
 *
 * Uses Web Crypto (AES-256-GCM), available in both the Convex default runtime
 * and the test runtime, so no Node-only module is needed. The key comes from
 * `MEMBER_PAYMENTS_ENCRYPTION_KEY`; every ciphertext records the key version
 * that produced it so a rotation can still read older rows.
 *
 * These functions are only ever called from internal backend code. A decrypted
 * token must never be returned to a client, stored in a document, or logged.
 */

import { getMemberPaymentsEncryptionConfig } from "./memberPaymentsEnv";

export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

const AES_GCM_IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 32 random bytes, base64url — used for OAuth state and webhook routing keys. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Random lowercase hex.
 *
 * Used where the value has to survive being embedded in a delimited string —
 * an external reference is parsed by splitting on `_`, so its nonce must not
 * be base64url, which can contain `_` and `-`.
 */
export function randomHex(byteLength = 8): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 hex. Only the hash of an OAuth state is ever persisted. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison for hashes and signatures. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function importKey(rawKey: string): Promise<CryptoKey> {
  const keyBytes = fromBase64(rawKey);
  if (keyBytes.length !== 32) {
    throw new Error(
      "MEMBER_PAYMENTS_ENCRYPTION_KEY must be 32 bytes encoded as base64 (AES-256)",
    );
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecret(
  plaintext: string,
  config = getMemberPaymentsEncryptionConfig(),
): Promise<EncryptedValue> {
  const key = await importKey(config.key);
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  crypto.getRandomValues(iv);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    keyVersion: config.keyVersion,
  };
}

export async function decryptSecret(
  value: EncryptedValue,
  config = getMemberPaymentsEncryptionConfig(),
): Promise<string> {
  if (value.keyVersion !== config.keyVersion) {
    throw new Error(
      `Credential was encrypted with key version "${value.keyVersion}" but the deployment is configured with "${config.keyVersion}". Rotate keys before changing the version.`,
    );
  }

  const key = await importKey(config.key);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(value.iv) as unknown as ArrayBuffer },
    key,
    fromBase64(value.ciphertext) as unknown as ArrayBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

/** HMAC-SHA256 hex, used to verify Mercado Pago webhook signatures. */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
