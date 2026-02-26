/**
 * DnD id scheme for moving planifications and folders on the planifications page.
 * - Planification draggable: planification-${id}
 * - Folder draggable/droppable: folder-${id}
 * - Root "Todas" droppable: folder-root
 */

export const PLANIFICATION_PREFIX = 'planification-'
export const FOLDER_PREFIX = 'folder-'
export const FOLDER_ROOT_ID = 'folder-root'

export function getPlanificationDragId(planificationId: string): string {
  return `${PLANIFICATION_PREFIX}${planificationId}`
}

export function parsePlanificationDragId(dragId: string): string | null {
  if (!dragId.startsWith(PLANIFICATION_PREFIX)) return null
  return dragId.slice(PLANIFICATION_PREFIX.length)
}

export function getFolderDndId(folderId: string): string {
  return `${FOLDER_PREFIX}${folderId}`
}

/**
 * Returns the folder id if dragId is folder-${id}, or null for folder-root / non-folder ids.
 */
export function parseFolderDndId(dragId: string): string | null {
  if (dragId === FOLDER_ROOT_ID) return null
  if (!dragId.startsWith(FOLDER_PREFIX)) return null
  return dragId.slice(FOLDER_PREFIX.length)
}

/**
 * Returns true if dragId is a valid folder drop target (folder-* or folder-root).
 */
export function isFolderDropTarget(dragId: string): boolean {
  return dragId === FOLDER_ROOT_ID || dragId.startsWith(FOLDER_PREFIX)
}

export interface FolderForDnd {
  _id: string
  parentId?: string
}

/**
 * Returns the set of folder ids that are the given folder and all its descendants.
 * Used to reject dropping a folder onto itself or a child.
 */
export function getFolderAndDescendantIds(
  folderId: string,
  folders: FolderForDnd[]
): Set<string> {
  const result = new Set<string>([folderId])
  let added = true
  while (added) {
    added = false
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f._id)) {
        result.add(f._id)
        added = true
      }
    }
  }
  return result
}
