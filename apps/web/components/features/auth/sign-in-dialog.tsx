"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs/legacy";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const REDIRECT_URL_COMPLETE = "/select-organization";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SignInDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = React.useState(false);

  const signInWith = React.useCallback(
    (strategy: "oauth_google") => {
      if (!signIn || !isLoaded) return;
      setIsOAuthLoading(true);
      signIn
        .authenticateWithRedirect({
          strategy,
          redirectUrl: `${window.location.origin}/sign-in/sso-callback`,
          redirectUrlComplete: REDIRECT_URL_COMPLETE,
        })
        .catch((err) => {
          setIsOAuthLoading(false);
          toast.error(
            err?.errors?.[0]?.longMessage ?? "Error al iniciar sesión",
          );
        });
    },
    [signIn, isLoaded],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setIsSubmitting(true);
    try {
      const attempt = await signIn.create({
        identifier: email,
        password,
      });
      if (attempt.status === "complete") {
        await setActive({
          session: attempt.createdSessionId,
          navigate: () => router.push(REDIRECT_URL_COMPLETE),
        });
        onOpenChange(false);
        setEmail("");
        setPassword("");
      } else if (attempt.status === "needs_second_factor") {
        toast.info("Verificación en dos pasos habilitada. Completá el flujo.");
        onOpenChange(false);
      } else {
        toast.error("Completá los pasos requeridos para iniciar sesión.");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "errors" in err
          ? (err as { errors?: Array<{ longMessage?: string }> }).errors?.[0]
              ?.longMessage
          : null;
      toast.error(msg ?? "Error al iniciar sesión");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Iniciar sesión en MAT App</DialogTitle>
          <DialogDescription>
            Bienvenido de nuevo. Iniciá sesión para continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signInWith("oauth_google")}
            disabled={!isLoaded || isOAuthLoading}
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
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
            {isOAuthLoading ? "Conectando…" : "Continuar con Google"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                o
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                placeholder="Ingresá tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isLoaded || isSubmitting}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signin-password">Contraseña</Label>
              <Input
                id="signin-password"
                type="password"
                placeholder="Ingresá tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isLoaded || isSubmitting}
                required
              />
            </div>
            <Button type="submit" disabled={!isLoaded || isSubmitting}>
              {isSubmitting ? "Entrando…" : "Continuar"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Registrarse
            </Link>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
