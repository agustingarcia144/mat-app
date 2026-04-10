const CLERK_API_BASE = "https://api.clerk.com/v1";

type ClerkApiError = {
  long_message?: string;
  message?: string;
};

type ClerkApiFailure = {
  ok: false;
  status: number;
  message: string;
};

type ClerkApiSuccess<T> = {
  ok: true;
  status: number;
  data: T;
};

export type ClerkApiResult<T> = ClerkApiSuccess<T> | ClerkApiFailure;

function getSecretKey() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error("Missing CLERK_SECRET_KEY");
  }
  return secret;
}

export async function callClerkApi<T>(
  path: string,
  init?: RequestInit,
): Promise<ClerkApiResult<T>> {
  const secret = getSecretKey();
  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const firstError = Array.isArray(body?.errors)
      ? (body.errors[0] as ClerkApiError | undefined)
      : undefined;
    return {
      ok: false,
      status: response.status,
      message:
        firstError?.long_message ||
        firstError?.message ||
        body?.message ||
        "Clerk API request failed",
    };
  }

  return {
    ok: true,
    status: response.status,
    data: body as T,
  };
}
