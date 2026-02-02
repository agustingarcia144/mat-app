'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import FolderTree from '@/components/features/planifications/folder-tree/folder-tree'
import PlanificationList from '@/components/features/planifications/library/planification-list'
import { useState } from 'react'

export default function PlanificationsPage() {
  const router = useRouter()
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
        <Button onClick={() => router.push('/dashboard/planifications/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva planificación
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Folder tree sidebar */}
        <div className="col-span-3">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="font-semibold mb-4">Carpetas</h2>
            <FolderTree
              folders={folders || []}
              selectedId={selectedFolderId}
              onSelect={setSelectedFolderId}
            />
          </div>
        </div>

        {/* Planifications list */}
        <div className="col-span-9">
          <PlanificationList
            planifications={planifications || []}
            isLoading={planifications === undefined}
          />
        </div>
      </div>
    </div>
  )
}
