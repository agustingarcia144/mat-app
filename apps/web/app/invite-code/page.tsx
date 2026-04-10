"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ValidationReason = "invalid" | "expired" | "revoked" | "consumed" | null;

function getReasonMessage(reason: ValidationReason) {
  if (reason === "expired") return "El codigo vencio. Pedi uno nuevo.";
  if (reason === "revoked") return "Este codigo fue revocado.";
  if (reason === "consumed") return "Este codigo ya fue utilizado.";
  if (reason === "invalid") return "Codigo invalido.";
  return null;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function InviteCodeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, userId } = useAuth();
  const validateCode = useAction(api.orgCreationCodes.validateOrgCreationCode);
  const redeemCode = useAction(
    api.orgCreationCodes.redeemCodeAndCreateOrganization,
  );

  const [inviteCode, setInviteCode] = React.useState(
    searchParams.get("code") ?? "",
  );
  const [validatedCode, setValidatedCode] = React.useState<string | null>(null);
  const [validationReason, setValidationReason] =
    React.useState<ValidationReason>(null);
  const [isValidating, setIsValidating] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [organizationName, setOrganizationName] = React.useState("");
  const [organizationAddress, setOrganizationAddress] = React.useState("");
  const [organizationPhone, setOrganizationPhone] = React.useState("");
  const [organizationEmail, setOrganizationEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const autoValidatedRef = React.useRef(false);

  const handleValidate = React.useCallback(
    async (value: string) => {
      const normalized = normalizeCode(value);
      if (!normalized) {
        setValidatedCode(null);
        setValidationReason("invalid");
        return;
      }

      setIsValidating(true);
      setValidationReason(null);
      try {
        const result = await validateCode({ code: normalized });
        if (!result.valid) {
          setValidatedCode(null);
          setValidationReason(result.reason);
          return;
        }

        setValidatedCode(normalized);
        setValidationReason(null);
        router.replace(`/invite-code?code=${encodeURIComponent(normalized)}`);
      } catch (error) {
        setValidatedCode(null);
        setValidationReason("invalid");
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo validar el codigo",
        );
      } finally {
        setIsValidating(false);
      }
    },
    [router, validateCode],
  );

  React.useEffect(() => {
    const codeFromQuery = searchParams.get("code");
    if (!codeFromQuery || autoValidatedRef.current) return;
    autoValidatedRef.current = true;
    void handleValidate(codeFromQuery);
  }, [handleValidate, searchParams]);

  const redirectUrl = React.useMemo(() => {
    const codeForReturn = validatedCode ?? normalizeCode(inviteCode);
    return `/invite-code${codeForReturn ? `?code=${encodeURIComponent(codeForReturn)}` : ""}`;
  }, [inviteCode, validatedCode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validatedCode) {
      toast.error("Primero valida el codigo");
      return;
    }
    if (!organizationName.trim()) {
      toast.error("Completa el nombre de la organizacion");
      return;
    }

    setIsSubmitting(true);
    try {
      await redeemCode({
        code: validatedCode,
        organizationName: organizationName.trim(),
        organizationAddress: organizationAddress.trim() || undefined,
        organizationPhone: organizationPhone.trim() || undefined,
        organizationEmail: organizationEmail.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success("Organizacion creada correctamente");
      router.push("/dashboard");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo crear la organizacion",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Tengo invitacion</CardTitle>
          <CardDescription>
            Ingresa tu codigo para habilitar la creacion de una nueva
            organizacion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleValidate(inviteCode);
            }}
          >
            <Label htmlFor="invite-code">Codigo</Label>
            <div className="flex gap-2">
              <Input
                id="invite-code"
                placeholder="ORG-XXXX-XXXX-XXXX"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                disabled={isValidating || isSubmitting}
                required
              />
              <Button type="submit" disabled={isValidating || isSubmitting}>
                {isValidating ? "Validando..." : "Validar"}
              </Button>
            </div>
            {validationReason ? (
              <p className="text-sm text-destructive">
                {getReasonMessage(validationReason)}
              </p>
            ) : null}
            {validatedCode ? (
              <p className="text-sm text-emerald-600">Codigo valido.</p>
            ) : null}
          </form>

          {validatedCode && isLoaded && !userId ? (
            <div className="space-y-3 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">
                El codigo es valido. Ahora inicia sesion para continuar con la
                creacion.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link
                    href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}
                  >
                    Iniciar sesion
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {validatedCode && userId ? (
            <form
              className="space-y-4 rounded-md border p-4"
              onSubmit={handleSubmit}
            >
              <h2 className="font-medium">Datos de la nueva organizacion</h2>
              <div className="space-y-2">
                <Label htmlFor="org-name">Nombre de la organizacion</Label>
                <Input
                  id="org-name"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-address">Direccion</Label>
                <Input
                  id="org-address"
                  value={organizationAddress}
                  onChange={(event) =>
                    setOrganizationAddress(event.target.value)
                  }
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="org-phone">Telefono de la organizacion</Label>
                  <Input
                    id="org-phone"
                    value={organizationPhone}
                    onChange={(event) =>
                      setOrganizationPhone(event.target.value)
                    }
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-email">Email de la organizacion</Label>
                  <Input
                    id="org-email"
                    type="email"
                    value={organizationEmail}
                    onChange={(event) =>
                      setOrganizationEmail(event.target.value)
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-phone">Tu telefono</Label>
                <Input
                  id="admin-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Creando organizacion..."
                  : "Crear organizacion"}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

export default function InviteCodePage() {
  return (
    <React.Suspense
      fallback={
        <main className="container mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 py-10">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Tengo invitacion</CardTitle>
              <CardDescription>
                Ingresa tu codigo para habilitar la creacion de una nueva
                organizacion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Cargando...</p>
            </CardContent>
          </Card>
        </main>
      }
    >
      <InviteCodeContent />
    </React.Suspense>
  );
}
