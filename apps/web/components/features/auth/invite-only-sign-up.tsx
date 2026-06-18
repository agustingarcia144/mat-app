"use client";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AuthenticateWithRedirectCallback,
  useClerk,
  useUser,
} from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureHandledError } from "@/lib/sentry";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STAFF_REDIRECT = "/select-organization";
const PENDING_LITE_CHECKOUT_KEY = "mat.pendingLiteCheckout";
const PENDING_PRO_TRIAL_KEY = "mat.pendingProTrial";

function getSafeRedirectUrl(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/")) return decoded;
  } catch {
    // Ignore malformed redirect values.
  }
  return fallback;
}

function InvitationStatusCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children ? (
          <CardContent className="flex gap-2">{children}</CardContent>
        ) : null}
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function CustomSignUpForm({
  redirectUrlComplete,
}: {
  redirectUrlComplete: string;
}) {
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  const signUpWithGoogle = () => {
    if (!isLoaded || !signUp) return;
    setIsOAuthLoading(true);
    signUp
      .authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sign-up/sso-callback?redirect_url=${encodeURIComponent(
          redirectUrlComplete,
        )}`,
        redirectUrlComplete,
      })
      .catch((error) => {
        setIsOAuthLoading(false);
        captureHandledError(error, {
          area: "auth",
          action: "sign_up_with_google_redirect",
          extras: { redirectUrlComplete },
        });
        toast.error(
          error?.errors?.[0]?.longMessage ?? "Error al crear la cuenta",
        );
      });
  };

  const handleCreateAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !signUp) return;
    setIsSubmitting(true);
    try {
      const attempt = await signUp.create({
        emailAddress: email,
        password,
      });

      if (attempt.status === "complete") {
        await setActive({
          session: attempt.createdSessionId,
          navigate: () => router.push(redirectUrlComplete),
        });
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setIsVerifyingEmail(true);
      toast.success("Te enviamos un código de verificación por email.");
    } catch (error: unknown) {
      captureHandledError(error, {
        area: "auth",
        action: "sign_up_with_password",
        extras: { redirectUrlComplete },
      });
      const message =
        error && typeof error === "object" && "errors" in error
          ? (error as { errors?: Array<{ longMessage?: string }> }).errors?.[0]
              ?.longMessage
          : null;
      toast.error(message ?? "Error al crear la cuenta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !signUp) return;
    setIsSubmitting(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (attempt.status !== "complete") {
        toast.error("Completá la verificación para continuar.");
        return;
      }

      await setActive({
        session: attempt.createdSessionId,
        navigate: () => router.push(redirectUrlComplete),
      });
    } catch (error: unknown) {
      captureHandledError(error, {
        area: "auth",
        action: "verify_sign_up_email",
        extras: { redirectUrlComplete },
      });
      const message =
        error && typeof error === "object" && "errors" in error
          ? (error as { errors?: Array<{ longMessage?: string }> }).errors?.[0]
              ?.longMessage
          : null;
      toast.error(message ?? "No se pudo verificar el email");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-100">
      <CardHeader>
        <CardTitle>Crear cuenta en MAT App</CardTitle>
        <CardDescription>
          Registrate para continuar con la activación de tu organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!isVerifyingEmail ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={signUpWithGoogle}
              disabled={!isLoaded || isOAuthLoading}
            >
              <GoogleIcon />
              {isOAuthLoading ? "Conectando..." : "Continuar con Google"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">o</span>
              </div>
            </div>

            <form onSubmit={handleCreateAccount} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="Ingresá tu email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={!isLoaded || isSubmitting}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="signup-password">Contraseña</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Creá una contraseña"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={!isLoaded || isSubmitting}
                  required
                />
              </div>
              <Button type="submit" disabled={!isLoaded || isSubmitting}>
                {isSubmitting ? "Creando..." : "Continuar"}
              </Button>
              <div
                id="clerk-captcha"
                data-cl-theme="auto"
                data-cl-size="flexible"
                className="min-h-0"
              />
            </form>
          </>
        ) : (
          <form onSubmit={handleVerifyEmail} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="signup-code">Código de verificación</Label>
              <Input
                id="signup-code"
                inputMode="numeric"
                placeholder="Ingresá el código"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                disabled={!isLoaded || isSubmitting}
                required
              />
            </div>
            <Button type="submit" disabled={!isLoaded || isSubmitting}>
              {isSubmitting ? "Verificando..." : "Crear cuenta"}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrlComplete)}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function InviteOnlySignUp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { signOut } = useClerk();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useUser();
  const ticket = searchParams.get("__clerk_ticket");
  const accountStatus = searchParams.get("__clerk_status");
  const inviteToken = searchParams.get("invite_token");
  const inviteCode = searchParams.get("invite_code");
  const isSignUpSsoCallback = pathname?.startsWith("/sign-up/sso-callback");
  const hasPendingLiteCheckout =
    typeof window !== "undefined" &&
    Boolean(window.sessionStorage.getItem(PENDING_LITE_CHECKOUT_KEY));
  const hasPendingProTrial =
    typeof window !== "undefined" &&
    Boolean(window.sessionStorage.getItem(PENDING_PRO_TRIAL_KEY));
  const liteCheckout =
    searchParams.get("lite_checkout") === "1" ||
    (isSignUpSsoCallback && hasPendingLiteCheckout);
  const startTrial =
    searchParams.get("start_trial") === "1" ||
    (isSignUpSsoCallback && hasPendingProTrial);
  const redirectUrl = searchParams.get("redirect_url");
  const fallbackRedirect = inviteToken
    ? `/invitations/accept?token=${encodeURIComponent(inviteToken)}`
    : inviteCode
      ? `/invite-code?code=${encodeURIComponent(inviteCode)}&continue=1`
      : startTrial
        ? "/?start_trial=1"
        : liteCheckout
          ? "/?lite_checkout=1"
          : STAFF_REDIRECT;
  const postSignUpRedirect = getSafeRedirectUrl(redirectUrl, fallbackRedirect);
  const attemptedRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    if (isSignedIn && !ticket) {
      router.replace(postSignUpRedirect);
    }
  }, [isSignedIn, postSignUpRedirect, router, ticket]);

  useEffect(() => {
    if (
      !ticket ||
      accountStatus !== "sign_in" ||
      !isLoaded ||
      !signIn ||
      attemptedRef.current
    ) {
      return;
    }

    attemptedRef.current = true;

    void signIn
      .create({
        strategy: "ticket",
        ticket,
      })
      .then(async (attempt) => {
        if (attempt.status !== "complete") {
          throw new Error("No se pudo completar el acceso con la invitación.");
        }

        await setActive({
          session: attempt.createdSessionId,
          navigate: () => router.replace(STAFF_REDIRECT),
        });
      })
      .catch(async (error: unknown) => {
        captureHandledError(error, {
          area: "auth",
          action: "accept_invitation_ticket_sign_in",
          extras: {
            hasInviteToken: Boolean(inviteToken),
            hasInviteCode: Boolean(inviteCode),
          },
        });
        const message =
          error && typeof error === "object" && "errors" in error
            ? (error as { errors?: Array<{ longMessage?: string }> })
                .errors?.[0]?.longMessage
            : null;

        if (message && /already signed in/i.test(message)) {
          attemptedRef.current = false;
          await signOut();
          setRetryKey((current) => current + 1);
          return;
        }

        setSignInError(
          message ??
            "No se pudo completar el ingreso con esta invitación. Vuelve a intentarlo.",
        );
      });
  }, [
    accountStatus,
    isLoaded,
    inviteCode,
    inviteToken,
    retryKey,
    router,
    setActive,
    signIn,
    signOut,
    ticket,
  ]);

  if (isSignUpSsoCallback) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <AuthenticateWithRedirectCallback
          signInFallbackRedirectUrl={postSignUpRedirect}
          signUpFallbackRedirectUrl={postSignUpRedirect}
        />
      </div>
    );
  }

  if (!ticket && !inviteToken && !inviteCode && !liteCheckout && !startTrial) {
    return (
      <InvitationStatusCard
        title="Acceso solo por invitación"
        description="Esta plataforma se habilita únicamente para usuarios invitados por un administrador del gimnasio."
      >
        <Button asChild>
          <Link href="/sign-in">Iniciar sesión</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Volver al inicio</Link>
        </Button>
      </InvitationStatusCard>
    );
  }

  if (accountStatus === "sign_in") {
    if (signInError) {
      return (
        <InvitationStatusCard
          title="No se pudo aceptar la invitación"
          description={signInError}
        >
          <Button
            type="button"
            onClick={() => {
              attemptedRef.current = false;
              setSignInError(null);
              setRetryKey((current) => current + 1);
            }}
          >
            Reintentar
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </InvitationStatusCard>
      );
    }

    return (
      <InvitationStatusCard
        title="Conectando tu invitación"
        description="Estamos validando tu acceso para entrar a la organización."
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Ingresando…
        </div>
      </InvitationStatusCard>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <CustomSignUpForm redirectUrlComplete={postSignUpRedirect} />
    </div>
  );
}
