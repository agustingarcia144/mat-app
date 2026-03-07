'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useOrganization, useOrganizationList } from '@clerk/nextjs'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { getOrgRoleLabel } from '@/lib/security/roles'

export default function SelectOrganizationPage() {
  const router = useRouter()
  const { organization } = useOrganization()
  const { userMemberships, setActive, isLoaded } = useOrganizationList({
    userMemberships: true,
  })
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization
  )
  const [loadingOrgId, setLoadingOrgId] = useState<string | null>(null)

  const memberships = useMemo(() => userMemberships?.data ?? [], [userMemberships])

  useEffect(() => {
    if (organization?.id) {
      router.replace('/dashboard')
    }
  }, [organization?.id, router])

  const activateOrganization = useCallback(
    async (organizationId: string) => {
      setLoadingOrgId(organizationId)
      try {
        await setActive?.({ organization: organizationId } as never)
        await setActiveOrganization({
          organizationExternalId: organizationId,
        })
        router.replace('/dashboard')
      } finally {
        setLoadingOrgId(null)
      }
    },
    [router, setActive, setActiveOrganization]
  )

  useEffect(() => {
    if (!isLoaded) return
    if (memberships.length === 1 && !organization?.id) {
      void activateOrganization(memberships[0].organization.id)
    }
  }, [activateOrganization, isLoaded, memberships, organization?.id])

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando organizaciones...</p>
      </div>
    )
  }

  if (memberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">Sin acceso a organización</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta no tiene membresías activas. Solicita una invitación a un
            administrador.
          </p>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/sign-in">Volver a inicio de sesión</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">Selecciona tu organización</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elige el gimnasio al que deseas acceder en esta sesión.
        </p>

        <div className="mt-6 grid gap-3">
          {memberships.map((membership) => {
            const isLoading = loadingOrgId === membership.organization.id
            return (
              <Button
                key={membership.organization.id}
                variant="outline"
                className="h-auto justify-between p-4"
                disabled={Boolean(loadingOrgId)}
                onClick={() => activateOrganization(membership.organization.id)}
              >
                <div className="text-left">
                  <p className="font-medium">{membership.organization.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Rol: {getOrgRoleLabel(membership.role)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
