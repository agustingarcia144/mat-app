'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import PlanificationListTable from '@/components/features/planifications/library/planification-list-table'

export default function TemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const templates = useQuery(api.planifications.getTemplates)

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
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No hay plantillas</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Las plantillas son planificaciones reutilizables que no
                pertenecen a ninguna carpeta y no se asignan a miembros. Crea
                una desde &quot;Nueva planificación&quot; marcando la opción
                plantilla.
              </p>
            </div>
          ) : (
            <PlanificationListTable
              planifications={templates}
              isLoading={false}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
