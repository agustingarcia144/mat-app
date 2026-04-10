import { SignInPageContent } from "@/components/features/auth/sign-in-page-content";

type Props = {
  searchParams: Promise<{ redirect_url?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectUrl = params.redirect_url ?? null;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignInPageContent redirectUrlFromQuery={redirectUrl} />
    </div>
  );
}
