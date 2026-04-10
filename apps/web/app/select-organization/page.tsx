"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  getOrgRoleLabel,
  isOrgStaffRole,
  isWebStaffGuardEnabled,
} from "@/lib/security/roles";

export default function SelectOrganizationPage() {
  const router = useRouter();
  const organizations = useQuery(
    api.organizationMemberships.getMyStaffOrganizations,
  );
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
  );
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization,
  );
  const [loadingOrgId, setLoadingOrgId] = useState<string | null>(null);

  const memberships = useMemo(() => organizations ?? [], [organizations]);
  const isLoaded =
    organizations !== undefined && currentMembership !== undefined;

  useEffect(() => {
    if (!isLoaded) return;

    if (!isWebStaffGuardEnabled()) {
      router.replace("/dashboard");
      return;
    }

    if (isOrgStaffRole(currentMembership?.role)) {
      router.replace("/dashboard");
    }
  }, [currentMembership?.role, isLoaded, router]);

  const activateOrganization = useCallback(
    async (organizationId: string) => {
      setLoadingOrgId(organizationId);
      try {
        await setActiveOrganization({
          organizationId: organizationId as never,
        });
        router.replace("/dashboard");
      } finally {
        setLoadingOrgId(null);
      }
    },
    [router, setActiveOrganization],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (memberships.length === 1 && !currentMembership?.organization?._id) {
      const onlyOrganizationId = memberships[0].organizationId;
      if (onlyOrganizationId) {
        void activateOrganization(onlyOrganizationId);
      }
    }
  }, [
    activateOrganization,
    currentMembership?.organization?._id,
    isLoaded,
    memberships,
  ]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Cargando organizaciones...
        </p>
      </div>
    );
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Sin acceso a organización</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta no tiene organizaciones con rol de administrador o
            entrenador para acceder a la web.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/sign-in">Volver a inicio de sesión</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">Selecciona tu organización</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elige el gimnasio al que deseas acceder en esta sesión.
        </p>

        <div className="mt-6 grid gap-3">
          {memberships.map((membership: (typeof memberships)[number]) => {
            const organizationId = membership.organizationId;
            const isLoading = loadingOrgId === organizationId;
            return (
              <Button
                key={membership.organizationId}
                variant="outline"
                className="h-auto justify-between p-4"
                disabled={Boolean(loadingOrgId) || !organizationId}
                onClick={() => activateOrganization(organizationId)}
              >
                <div className="text-left">
                  <p className="font-medium">{membership.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    Rol: {getOrgRoleLabel(membership.role)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {isLoading ? "Entrando..." : "Entrar"}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
