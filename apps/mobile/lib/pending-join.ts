import * as SecureStore from "expo-secure-store";

const PENDING_JOIN_KEY = "pendingJoinToken";

export async function getPendingJoinToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_JOIN_KEY);
  } catch {
    return null;
  }
}

export async function setPendingJoinToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_JOIN_KEY, token);
  } catch (e) {
    console.warn("Failed to store pending join token:", e);
  }
}

export async function clearPendingJoinToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_JOIN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Extract join token from a deep link URL.
 * Supports: https://domain/join/TOKEN, mat-app://join/TOKEN
 */
export function parseJoinTokenFromUrl(url: string): string | null {
  const decodeToken = (value: string) => {
    try {
      return decodeURIComponent(value).trim() || null;
    } catch {
      return value.trim() || null;
    }
  };

  const extractFromPath = (path: string) => {
    const match = /\/join\/([^/?#]+)/.exec(path);
    if (!match) return null;
    return decodeToken(match[1]);
  };

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mat-app:" && parsed.hostname === "join") {
      const token = parsed.pathname.replace(/^\/+/, "").split(/[/?#]/)[0];
      return decodeToken(token);
    }

    return extractFromPath(parsed.pathname || parsed.href.split("?")[0]);
  } catch {
    return extractFromPath(url);
  }
}
