'use client'

import Image from 'next/image'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import PlanificationListTable from '@/components/features/planifications/library/planification-list-table'
import type { PlanificationData } from '@/components/features/planifications/library/planification-list'
import matWolfLooking from '@/assets/mat-wolf-looking.png'
import { useCanQueryCurrentOrganization } from '@/hooks/use-can-query-current-organization'

export default function TemplatesDialog({
  open,
  onOpenChange,
  onUseTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseTemplate?: (template: PlanificationData) => void
}) {
  const canQueryCurrentOrganization = useCanQueryCurrentOrganization()
  const templates = useQuery(
    api.planifications.getTemplates,
    open && canQueryCurrentOrganization ? {} : 'skip'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plantillas</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          {templates === undefined ? (
            <PlanificationListTable planifications={[]} isLoading />
          ) : templates.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia>
                  <Image
                    src={matWolfLooking}
                    alt=""
                    className="h-20 w-20 object-contain"
                  />
                </EmptyMedia>
                <EmptyTitle>No hay plantillas</EmptyTitle>
                <EmptyDescription>
                  Las plantillas son planificaciones reutilizables que no
                  pertenecen a ninguna carpeta y no se asignan a miembros. Crea
                  una desde &quot;Nueva planificación&quot; marcando la opción
                  plantilla.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <PlanificationListTable
              planifications={templates}
              isLoading={false}
              onUseTemplate={onUseTemplate}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
