import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

type Props = {
  searchParams: Promise<{ redirect_url?: string }>;
};

const DEFAULT_FALLBACK_REDIRECT = "/select-organization";

function getSafeFallbackRedirectUrl(value: string | undefined) {
  if (!value) return DEFAULT_FALLBACK_REDIRECT;
  if (!value.startsWith("/")) return DEFAULT_FALLBACK_REDIRECT;
  return value;
}

export default async function SignInSsoCallbackPage({ searchParams }: Props) {
  const params = await searchParams;
  const fallbackRedirectUrl = getSafeFallbackRedirectUrl(params.redirect_url);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={fallbackRedirectUrl}
      />
    </div>
  );
}
