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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import PlanificationList from '@/components/features/planifications/library/planification-list'
import PlanificationListTable from '@/components/features/planifications/library/planification-list-table'
import FolderTreeSidebar from '@/components/features/planifications/folder-tree/folder-tree'
import CreatePlanificationDialog from '@/components/features/planifications/dialogs/create-planification-dialog'
import TemplatesDialog from '@/components/features/planifications/dialogs/templates-dialog'

export default function PlanificationsPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false)
  const [dialogFolderId, setDialogFolderId] = useState<string | undefined>()
  const [listView, setListView] = useState<'grid' | 'table'>('grid')

  const folders = useQuery(api.folders.getTree)
  const deletableFolderIds = useQuery(api.folders.getDeletableFolderIds)
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
            deletableFolderIds={deletableFolderIds ?? []}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={75} className="relative">
          <div className="absolute inset-0 flex flex-col">
            <div className="shrink-0 flex justify-end p-4 pb-2 items-center gap-2">
              <span className="text-sm text-muted-foreground">Vista:</span>
              <Select
                value={listView}
                onValueChange={(v) => setListView(v as 'grid' | 'table')}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Vista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Cuadrícula</SelectItem>
                  <SelectItem value="table">Tabla</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {listView === 'grid' ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div className="flex-1 min-h-0 p-4 pt-2 overflow-auto">
                    <PlanificationList
                      planifications={planifications || []}
                      isLoading={planifications === undefined}
                    />
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
            ) : (
              <div className="flex-1 min-h-0 p-4 pt-2 overflow-auto">
                <PlanificationListTable
                  planifications={planifications || []}
                  isLoading={planifications === undefined}
                />
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
