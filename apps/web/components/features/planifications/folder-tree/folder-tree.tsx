'use client'

import { useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import CreateFolderDialog from '@/components/features/planifications/folder-tree/create-folder-dialog'

interface FolderData {
  _id: string
  name: string
  parentId?: string
  path: string
  order: number
}

interface FolderTreeProps {
  folders: FolderData[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

interface FolderItemProps {
  folder: FolderData
  child?: FolderData[]
  level: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}

function FolderItem({
  folder,
  child,
  level,
  selectedId,
  onSelect,
}: FolderItemProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const isSelected = selectedId === folder._id
  const hasChildren = child && child.length > 0

  return (
    <div>
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva subcarpeta
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && hasChildren && (
        <div>
          {child?.map((child) => (
            <FolderTreeItem
              key={child._id}
              folder={child}
              folders={[]}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {showCreateDialog && (
        <CreateFolderDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          parentId={folder._id}
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
}: {
  folder: FolderData
  folders: FolderData[]
  level: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const child = folders.filter((f) => f.parentId === folder._id)
  return (
    <FolderItem
      folder={folder}
      child={child}
      level={level}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  )
}

export default function FolderTree({
  folders,
  selectedId,
  onSelect,
}: FolderTreeProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
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
        <span className="text-sm font-medium">Todas</span>
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
        />
      ))}

      {/* Create root folder button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start mt-2"
        onClick={() => setShowCreateDialog(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Nueva carpeta
      </Button>

      <CreateFolderDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        parentId={undefined}
      />
    </div>
  )
}
