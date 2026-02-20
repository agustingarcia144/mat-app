'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Plus, FileStack, FolderTree } from 'lucide-react'
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import PlanificationList from '@/components/features/planifications/library/planification-list'
import PlanificationListTable from '@/components/features/planifications/library/planification-list-table'
import FolderTreeSidebar from '@/components/features/planifications/folder-tree/folder-tree'
import CreatePlanificationDialog from '@/components/features/planifications/dialogs/create-planification-dialog'
import TemplatesDialog from '@/components/features/planifications/dialogs/templates-dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { ResponsiveActionButton } from '@/components/ui/responsive-action-button'
import { DashboardPageContainer } from '@/components/shared/responsive/dashboard-page-container'

export default function PlanificationsPage() {
  const isMobile = useIsMobile()
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false)
  const [dialogFolderId, setDialogFolderId] = useState<string | undefined>()
  const [listView, setListView] = useState<'grid' | 'table'>('grid')
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false)

  const folders = useQuery(api.folders.getTree)
  const deletableFolderIds = useQuery(api.folders.getDeletableFolderIds)
  const planifications = useQuery(api.planifications.getByFolder, {
    folderId: selectedFolderId ? (selectedFolderId as any) : undefined,
  })

  const selectedFolderName = selectedFolderId
    ? folders?.find((folder) => folder._id === selectedFolderId)?.name
    : 'Todas'

  const planificationsGrid = (
    <PlanificationList
      planifications={planifications || []}
      isLoading={planifications === undefined}
    />
  )

  const desktopListContent =
    listView === 'grid' ? (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className='flex-1 min-h-0 p-4 pt-2 overflow-auto'>
            {planificationsGrid}
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
      <div className='flex-1 min-h-0 p-4 pt-2 overflow-auto'>
        <PlanificationListTable
          planifications={planifications || []}
          isLoading={planifications === undefined}
        />
      </div>
    )

  const dialogs = (
    <>
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
    </>
  )

  if (isMobile) {
    return (
      <DashboardPageContainer className='space-y-4 py-4 md:py-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold'>Planificaciones</h1>
          <p className='text-sm text-muted-foreground'>
            Gestiona programas de entrenamiento
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <ResponsiveActionButton
            variant='outline'
            onClick={() => setTemplatesDialogOpen(true)}
            icon={<FileStack className='h-4 w-4' aria-hidden />}
            label='Ver Plantillas'
            tooltip='Ver Plantillas'
          />
          <ResponsiveActionButton
            onClick={() => {
              setDialogFolderId(undefined)
              setCreateDialogOpen(true)
            }}
            icon={<Plus className='h-4 w-4' aria-hidden />}
            label='Nueva planificación'
            tooltip='Nueva planificación'
          />
          <Sheet open={mobileFoldersOpen} onOpenChange={setMobileFoldersOpen}>
            <SheetTrigger asChild>
              <ResponsiveActionButton
                variant='outline'
                icon={<FolderTree className='h-4 w-4' aria-hidden />}
                label='Carpetas'
                tooltip='Seleccionar carpeta'
              />
            </SheetTrigger>
            <SheetContent side='right' className='w-full sm:max-w-md'>
              <SheetHeader>
                <SheetTitle>Carpetas</SheetTitle>
              </SheetHeader>
              <div className='mt-4 overflow-y-auto'>
                <FolderTreeSidebar
                  folders={folders || []}
                  selectedId={selectedFolderId}
                  onSelect={(id) => {
                    setSelectedFolderId(id)
                    setMobileFoldersOpen(false)
                  }}
                  deletableFolderIds={deletableFolderIds ?? []}
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className='rounded-lg border p-3'>
          <p className='text-xs text-muted-foreground'>Carpeta activa</p>
          <p className='truncate text-sm font-medium'>{selectedFolderName}</p>
        </div>

        <div className='rounded-lg border p-3'>{planificationsGrid}</div>

        {dialogs}
      </DashboardPageContainer>
    )
  }

  return (
    <DashboardPageContainer className='py-6'>
      <div className='mb-6 flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>Planificaciones</h1>
          <p className='mt-1 text-muted-foreground'>
            Gestiona programas de entrenamiento
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <ResponsiveActionButton
            variant="outline"
            onClick={() => setTemplatesDialogOpen(true)}
            icon={<FileStack className='h-4 w-4' aria-hidden />}
            label='Ver Plantillas'
            tooltip='Ver Plantillas'
          />
          <ResponsiveActionButton
            onClick={() => {
              setDialogFolderId(undefined)
              setCreateDialogOpen(true)
            }}
            icon={<Plus className='h-4 w-4' aria-hidden />}
            label='Nueva planificación'
            tooltip='Nueva planificación'
          />
        </div>
      </div>

      {dialogs}

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
            {desktopListContent}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </DashboardPageContainer>
  )
}
