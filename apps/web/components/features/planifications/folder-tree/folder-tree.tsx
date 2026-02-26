'use client'

import { useState, useCallback } from 'react'
import { ChevronRight, Folder, FolderOpen, FolderInput, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/react'
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
import MoveFolderDialog from '@/components/features/planifications/folder-tree/move-folder-dialog'
import {
  FOLDER_ROOT_ID,
  getFolderDndId,
} from '@/components/features/planifications/planification-folder-dnd'

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
  /** When true, folders and root are draggable/droppable for DnD move. Default false (e.g. in picker dialogs). */
  enableDnd?: boolean
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
  enableDnd?: boolean
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
  enableDnd?: boolean
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
  enableDnd,
}: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const isSelected = selectedId === folder._id
  const hasChildren = child && child.length > 0
  const canDelete =
    deletableFolderIds != null && deletableFolderIds.includes(folder._id)

  const dndId = getFolderDndId(folder._id)
  const { ref: dragRef, handleRef, isDragging } = useDraggable({
    id: enableDnd ? dndId : `noop-folder-${folder._id}`,
  })
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: enableDnd ? dndId : `noop-folder-${folder._id}`,
  })
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (enableDnd) {
        dragRef(el)
        dropRef(el)
      }
    },
    [enableDnd, dragRef, dropRef]
  )

  const rowContent = (
    <>
      {enableDnd && (
        <div
          ref={handleRef as (el: HTMLDivElement | null) => void}
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground opacity-0 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-hidden
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
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
    </>
  )

  const rowClassName = cn(
    'flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer group',
    isSelected && 'bg-accent',
    enableDnd && isDragging && 'opacity-50',
    enableDnd && isDropTarget && 'ring-2 ring-white'
  )

  return (
    <div>
      {!disableCreate ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={enableDnd ? setRef : undefined}
              className={rowClassName}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {rowContent}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva subcarpeta
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowMoveDialog(true)}>
              <FolderInput className="h-4 w-4 mr-2" />
              Mover
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => canDelete && setShowDeleteDialog(true)}
              className="text-destructive"
              disabled={!canDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <div
          ref={enableDnd ? setRef : undefined}
          className={rowClassName}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {rowContent}
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
              enableDnd={enableDnd}
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

      {!disableCreate && showMoveDialog && (
        <MoveFolderDialog
          open={showMoveDialog}
          onOpenChange={setShowMoveDialog}
          folderId={folder._id}
          folderName={folder.name}
          folders={folders}
          onSuccess={() => {
            if (selectedId === folder._id) {
              onSelect(null)
            }
          }}
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
  enableDnd,
}: {
  folder: FolderData
  folders: FolderData[]
  level: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  disableCreate?: boolean
  deletableFolderIds?: string[]
  enableDnd?: boolean
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
      enableDnd={enableDnd}
    />
  )
}

function DroppableRootRow({
  rootLabel,
  selectedId,
  onSelect,
  enableDnd,
}: {
  rootLabel: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  enableDnd?: boolean
}) {
  const { ref, isDropTarget } = useDroppable({
    id: enableDnd ? FOLDER_ROOT_ID : 'noop-root',
  })
  return (
    <div
      ref={enableDnd ? ref : undefined}
      className={cn(
        'flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-accent cursor-pointer',
        selectedId === null && 'bg-accent',
        enableDnd && isDropTarget && 'ring-2 ring-white'
      )}
      onClick={() => onSelect(null)}
    >
      <Folder className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{rootLabel}</span>
    </div>
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
  enableDnd,
}: FolderTreeProps) {
  const rootFolders = folders.filter((f) => !f.parentId)

  return (
    <div className="space-y-1">
      <DroppableRootRow
        rootLabel={rootLabel}
        selectedId={selectedId}
        onSelect={onSelect}
        enableDnd={enableDnd}
      />

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
          enableDnd={enableDnd}
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
  enableDnd = false,
}: FolderTreeSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Carpetas</h1>
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
        enableDnd={enableDnd}
      />
    </div>
  )
}
