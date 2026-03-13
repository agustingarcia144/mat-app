import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
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
  const membershipsQuery = useQuery(
    api.organizationMemberships.getMyStaffOrganizations
  )
  const currentMembership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization
  )
  const setActiveOrganization = useMutation(
    api.organizationMemberships.setActiveOrganization
  )
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const isLoaded =
    membershipsQuery !== undefined && currentMembership !== undefined

  const canEditOrganization = useMemo(
    () => isOrgAdminRole(currentMembership?.role),
    [currentMembership?.role]
  )
  const memberships = useMemo(
    () => membershipsQuery ?? [],
    [membershipsQuery]
  )

  const activeOrganizationId = currentMembership?.organization?._id ?? null
  const activeOrganizationName = currentMembership?.organization?.name ?? null
  const activeOrganizationLogoUrl = currentMembership?.organization?.logoUrl ?? null

  const switchOrganization = async (organizationId: string) => {
    if (
      !organizationId ||
      organizationId === activeOrganizationId
    ) {
      return
    }

    setSwitchingOrgId(organizationId)
    try {
      await setActiveOrganization({
        organizationId: organizationId as never,
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
                {activeOrganizationLogoUrl ? (
                  <div className="relative size-8 shrink-0 overflow-hidden rounded-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeOrganizationLogoUrl}
                      alt={activeOrganizationName || 'Organization'}
                      className="size-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex size-8 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                    <span className="text-xs font-semibold">
                      {activeOrganizationName?.charAt(0).toUpperCase() || 'O'}
                    </span>
                  </div>
                )}
                <div className="grid flex-1 text-left text-sm leading-tight max-w-42">
                  <span className="truncate font-semibold">
                    {activeOrganizationName ?? 'Sin organización'}
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
                const organizationId = item.organizationId
                const isActive = organizationId === activeOrganizationId
                const isSwitching = switchingOrgId === organizationId
                return (
                  <DropdownMenuItem
                    key={item.organizationId}
                    onSelect={(event) => {
                      event.preventDefault()
                      void switchOrganization(organizationId)
                    }}
                    disabled={Boolean(switchingOrgId) || !organizationId}
                  >
                    <span className="max-w-48 truncate">
                      {item.organizationName}
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
