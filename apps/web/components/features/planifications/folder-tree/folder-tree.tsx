'use client'

import { useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import CreateFolderDialog from '@/components/features/planifications/folder-tree/create-folder-dialog'
import DeleteFolderDialog from '@/components/features/planifications/folder-tree/delete-folder-dialog'

interface FolderData {
  _id: string
  name: string
  parentId?: string
  path: string
  order: number
}

interface FolderTreeSidebarProps {
  folders: FolderData[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Folder IDs that can be deleted (empty). When provided, "Eliminar" is shown in context menu. */
  deletableFolderIds?: string[]
}

interface FolderTreeProps {
  folders: FolderData[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  showCreateDialog: boolean
  setShowCreateDialog: (show: boolean) => void
  /** Label for the root option (e.g. "Sin carpeta" in picker mode). Default "Todas" */
  rootLabel?: string
  /** When true, hide create-folder actions (for picker/select mode). */
  disableCreate?: boolean
  /** Folder IDs that can be deleted (empty). When provided, "Eliminar" is shown in context menu. */
  deletableFolderIds?: string[]
}

interface FolderItemProps {
  folder: FolderData
  child?: FolderData[]
  folders: FolderData[]
  level: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  disableCreate?: boolean
  deletableFolderIds?: string[]
}

function FolderItem({
  folder,
  child,
  folders,
  level,
  selectedId,
  onSelect,
  disableCreate,
  deletableFolderIds,
}: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isSelected = selectedId === folder._id
  const hasChildren = child && child.length > 0
  const canDelete =
    deletableFolderIds != null && deletableFolderIds.includes(folder._id)

  return (
    <div>
      {!disableCreate ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer group',
                isSelected && 'bg-accent'
              )}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {hasChildren ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsExpanded(!isExpanded)
                  }}
                >
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 transition-transform',
                      isExpanded && 'rotate-90'
                    )}
                  />
                </Button>
              ) : (
                <div className="h-4 w-4" />
              )}

              <div
                className="flex items-center gap-2 flex-1 min-w-0"
                onClick={() => onSelect(folder._id)}
              >
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm truncate">{folder.name}</span>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva subcarpeta
            </ContextMenuItem>
            {canDelete && (
              <ContextMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <div
          className={cn(
            'flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer group',
            isSelected && 'bg-accent'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              <ChevronRight
                className={cn(
                  'h-3 w-3 transition-transform',
                  isExpanded && 'rotate-90'
                )}
              />
            </Button>
          ) : (
            <div className="h-4 w-4" />
          )}

          <div
            className="flex items-center gap-2 flex-1 min-w-0"
            onClick={() => onSelect(folder._id)}
          >
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="text-sm truncate">{folder.name}</span>
          </div>
        </div>
      )}

      {isExpanded && hasChildren && (
        <div>
          {child?.map((childFolder) => (
            <FolderTreeItem
              key={childFolder._id}
              folder={childFolder}
              folders={folders}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              disableCreate={disableCreate}
              deletableFolderIds={deletableFolderIds}
            />
          ))}
        </div>
      )}

      {!disableCreate && showCreateDialog && (
        <CreateFolderDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          parentId={folder._id}
        />
      )}

      {!disableCreate && showDeleteDialog && (
        <DeleteFolderDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          folderId={folder._id}
          folderName={folder.name}
          onSuccess={() => {
            if (selectedId === folder._id) {
              onSelect(null)
            }
          }}
        />
      )}
    </div>
  )
}

function FolderTreeItem({
  folder,
  folders,
  level,
  selectedId,
  onSelect,
  disableCreate,
  deletableFolderIds,
}: {
  folder: FolderData
  folders: FolderData[]
  level: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  disableCreate?: boolean
  deletableFolderIds?: string[]
}) {
  const child = folders.filter((f) => f.parentId === folder._id)
  return (
    <FolderItem
      folder={folder}
      child={child}
      folders={folders}
      level={level}
      selectedId={selectedId}
      onSelect={onSelect}
      disableCreate={disableCreate}
      deletableFolderIds={deletableFolderIds}
    />
  )
}

function FolderTree({
  folders,
  selectedId,
  onSelect,
  showCreateDialog,
  setShowCreateDialog,
  rootLabel = 'Todas',
  disableCreate = false,
  deletableFolderIds,
}: FolderTreeProps) {
  const rootFolders = folders.filter((f) => !f.parentId)

  return (
    <div className="space-y-1">
      {/* Root level */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer',
          selectedId === null && 'bg-accent'
        )}
        onClick={() => onSelect(null)}
      >
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{rootLabel}</span>
      </div>

      {/* Folder tree */}
      {rootFolders.map((folder) => (
        <FolderTreeItem
          key={folder._id}
          folder={folder}
          folders={folders}
          level={0}
          selectedId={selectedId}
          onSelect={onSelect}
          disableCreate={disableCreate}
          deletableFolderIds={deletableFolderIds}
        />
      ))}

      {!disableCreate && (
        <CreateFolderDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          parentId={undefined}
        />
      )}
    </div>
  )
}

export { FolderTree }

export default function FolderTreeSidebar({
  folders,
  selectedId,
  onSelect,
  deletableFolderIds,
}: FolderTreeSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Carpetas</h1>
        {/* Create root folder button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <FolderTree
        folders={folders}
        selectedId={selectedId}
        onSelect={onSelect}
        showCreateDialog={showCreateDialog}
        setShowCreateDialog={setShowCreateDialog}
        deletableFolderIds={deletableFolderIds}
      />
    </div>
  )
}
