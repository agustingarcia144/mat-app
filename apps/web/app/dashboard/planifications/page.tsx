'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import Link from 'next/link'
import PlanificationList from '@/components/features/planifications/library/planification-list'
import FolderTreeSidebar from '@/components/features/planifications/folder-tree/folder-tree'

export default function PlanificationsPage() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)

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
        <Button asChild>
          <Link href="/dashboard/planifications/new">
            <Plus className="h-4 w-4 mr-2" />
            Nueva planificación
          </Link>
        </Button>
      </div>

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
        <ResizablePanel defaultSize={75} className="p-4">
          {/* Planifications list */}
          <div>
            <PlanificationList
              planifications={planifications || []}
              isLoading={planifications === undefined}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
