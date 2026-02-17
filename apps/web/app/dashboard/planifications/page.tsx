'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Plus, FileStack } from 'lucide-react'
import { useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import PlanificationList from '@/components/features/planifications/library/planification-list'
import FolderTreeSidebar from '@/components/features/planifications/folder-tree/folder-tree'
import CreatePlanificationDialog from '@/components/features/planifications/dialogs/create-planification-dialog'
import TemplatesDialog from '@/components/features/planifications/dialogs/templates-dialog'

export default function PlanificationsPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false)
  const [dialogFolderId, setDialogFolderId] = useState<string | undefined>()

  const folders = useQuery(api.folders.getTree)
  const planifications = useQuery(api.planifications.getByFolder, {
    folderId: selectedFolderId ? (selectedFolderId as any) : undefined,
  })

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Planificaciones</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona programas de entrenamiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setTemplatesDialogOpen(true)}
          >
            <FileStack className="h-4 w-4 mr-2" />
            Ver Plantillas
          </Button>
          <Button
            onClick={() => {
              setDialogFolderId(undefined)
              setCreateDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva planificación
          </Button>
        </div>
      </div>

      <CreatePlanificationDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (!open) {
            setDialogFolderId(undefined)
          }
        }}
        folderId={dialogFolderId}
      />

      <TemplatesDialog
        open={templatesDialogOpen}
        onOpenChange={setTemplatesDialogOpen}
      />

      <ResizablePanelGroup
        orientation="horizontal"
        className="rounded-lg border"
      >
        <ResizablePanel defaultSize={25} className="p-4 bg-card">
          {/* Folder tree sidebar */}
          <FolderTreeSidebar
            folders={folders || []}
            selectedId={selectedFolderId}
            onSelect={setSelectedFolderId}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={75} className="relative">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="absolute inset-0">
                <div className="p-4 h-full flex flex-col">
                  <PlanificationList
                    planifications={planifications || []}
                    isLoading={planifications === undefined}
                  />
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() => {
                  setDialogFolderId(selectedFolderId || undefined)
                  setCreateDialogOpen(true)
                }}
              >
                Nueva Planificación
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
