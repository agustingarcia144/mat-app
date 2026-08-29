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

/**
 * The Mercado Pago return, as either a universal link or the custom scheme.
 *
 * Returns the in-app route with the local checkout session preserved, so the
 * return screen can ask the backend what actually happened. The session id is
 * only an identifier — nothing in the URL can grant access.
 */
function getPaymentReturnPath(path: string): string | null {
  try {
    const url = new URL(path);

    const isUniversalLink =
      url.protocol === "https:" &&
      WEB_APP_HOSTS.has(url.hostname) &&
      url.pathname.startsWith("/payments/return");

    // Custom-scheme fallback for devices where the universal link does not
    // resolve (app links not yet verified, or a browser that strips them).
    const isCustomScheme =
      url.protocol === "mat-app:" &&
      (url.hostname === "payments" || url.pathname.startsWith("/payments"));

    if (!isUniversalLink && !isCustomScheme) return null;

    const session = url.searchParams.get("session");
    return session
      ? `/payments/return?session=${encodeURIComponent(session)}`
      : "/payments/return";
  } catch {
    return null;
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

    const paymentReturnPath = getPaymentReturnPath(path);
    if (paymentReturnPath) {
      return paymentReturnPath;
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
