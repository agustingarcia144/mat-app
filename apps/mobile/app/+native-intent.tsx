import { parseJoinTokenFromUrl, setPendingJoinToken } from "@/lib/pending-join";

const WEB_APP_HOSTS = new Set(["matgestion.app", "www.matgestion.app"]);

function isWebAppUrl(path: string) {
  try {
    const url = new URL(path);
    return url.protocol === "https:" && WEB_APP_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function getPathFromIncomingUrl(path: string) {
  try {
    const url = new URL(path);

    if (url.protocol === "mat-app:") {
      if (url.hostname === "join") {
        return "/join-gym-confirm";
      }

      return url.pathname || (url.hostname ? `/${url.hostname}` : "/");
    }

    if (url.protocol === "https:" && WEB_APP_HOSTS.has(url.hostname)) {
      return url.pathname || "/";
    }
  } catch {
    // Expo Router may pass either a full URL or a path. Fall through to path handling.
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const token = parseJoinTokenFromUrl(path);
    if (token) {
      await setPendingJoinToken(token);
      return "/join-gym-confirm";
    }

    const nextPath = getPathFromIncomingUrl(path);

    if (
      nextPath === "/" ||
      nextPath === "/sso-callback" ||
      nextPath === "/sign-in" ||
      nextPath === "/sign-up"
    ) {
      return nextPath;
    }

    if (isWebAppUrl(path)) {
      return initial ? "/" : null;
    }

    return initial ? "/" : null;
  } catch {
    return "/";
  }
}
