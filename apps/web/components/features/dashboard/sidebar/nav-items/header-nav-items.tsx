import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { useOrganization, useOrganizationList } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useMutation } from 'convex/react'
import { Check, ChevronsUpDown, Settings } from 'lucide-react'
import { toast } from 'sonner'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import EditOrganizationDialog from './edit-organization-dialog'
import { api } from '@/convex/_generated/api'
import { isOrgAdminRole } from '@/lib/security/roles'

export default function HeaderNavItems() {
  const router = useRouter()
  const { organization, membership, isLoaded } = useOrganization()
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  })
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization
  )
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const canEditOrganization = useMemo(
    () => isOrgAdminRole(membership?.role),
    [membership?.role]
  )
  const memberships = useMemo(
    () => userMemberships?.data ?? [],
    [userMemberships]
  )

  const switchOrganization = async (organizationId: string) => {
    if (!organizationId || organizationId === organization?.id) return

    setSwitchingOrgId(organizationId)
    try {
      await setActive?.({ organization: organizationId } as never)
      await setActiveOrganization({
        organizationExternalId: organizationId,
      })
      router.refresh()
      toast.success('Organización activa actualizada')
    } catch (error) {
      toast.error('No se pudo cambiar la organización')
      console.error(error)
    } finally {
      setSwitchingOrgId(null)
    }
  }

  if (!isLoaded) {
    return <SidebarMenuSkeleton />
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg">
                {organization?.imageUrl ? (
                  <Image
                    src={organization.imageUrl}
                    alt={organization?.name || 'Organization'}
                    width={32}
                    height={32}
                    className="rounded-sm"
                  />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                    <span className="text-xs font-semibold">
                      {organization?.name?.charAt(0).toUpperCase() || 'O'}
                    </span>
                  </div>
                )}
                <div className="grid flex-1 text-left text-sm leading-tight max-w-42">
                  <span className="truncate font-semibold">
                    {organization?.name ?? 'Sin organización'}
                  </span>
                </div>
                <ChevronsUpDown className="size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" className="w-64">
              <DropdownMenuLabel>Organizaciones</DropdownMenuLabel>
              {memberships.length === 0 && (
                <DropdownMenuItem disabled>
                  No hay organizaciones disponibles
                </DropdownMenuItem>
              )}
              {memberships.map((item) => {
                const isActive = item.organization.id === organization?.id
                const isSwitching = switchingOrgId === item.organization.id
                return (
                  <DropdownMenuItem
                    key={item.organization.id}
                    onSelect={(event) => {
                      event.preventDefault()
                      void switchOrganization(item.organization.id)
                    }}
                    disabled={Boolean(switchingOrgId)}
                  >
                    <span className="max-w-48 truncate">
                      {item.organization.name}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {isSwitching ? 'Cambiando...' : ''}
                    </span>
                    {isActive && <Check className="size-4" />}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!canEditOrganization}
                onSelect={(event) => {
                  event.preventDefault()
                  setIsEditDialogOpen(true)
                }}
              >
                <Settings className="size-4" />
                Editar organización
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <EditOrganizationDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </>
  )
}
