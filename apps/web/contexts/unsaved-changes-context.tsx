'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const UNSAVED_CHANGES_TOAST_ID = 'unsaved-changes-global'

type SaveHandler = (() => void | Promise<void>) | null
type ShouldBlockNavigation = (targetPath: string) => boolean

type UnsavedEntry = {
  dirty: boolean
  isSaving: boolean
  saveHandler: SaveHandler
  shouldBlockNavigation?: ShouldBlockNavigation
  sequence: number
}

type EntriesState = Record<string, UnsavedEntry>

type PendingNavigation = {
  href: string
  replace: boolean
}

type UnsavedChangesContextValue = {
  entries: EntriesState
  isDirty: boolean
  registerEntry: (entryId: string) => void
  unregisterEntry: (entryId: string) => void
  setEntryDirty: (entryId: string, dirty: boolean) => void
  setEntrySaving: (entryId: string, saving: boolean) => void
  setEntrySaveHandler: (entryId: string, saveHandler: SaveHandler) => void
  setEntryShouldBlockNavigation: (
    entryId: string,
    shouldBlockNavigation: ShouldBlockNavigation | undefined
  ) => void
  allowNextNavigation: (targetPath?: string) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null
)

function toRelativePath(raw: string): { fullPath: string; routePath: string } {
  const parsed = new URL(raw, window.location.href)
  return {
    fullPath: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    routePath: `${parsed.pathname}${parsed.search}`,
  }
}

function resolveHistoryUrl(url?: string | URL | null): {
  fullPath: string
  routePath: string
} {
  if (url == null) {
    return toRelativePath(window.location.href)
  }
  return toRelativePath(String(url))
}

function isPrimaryUnmodifiedClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

function getRoutePathFromLocation() {
  return `${window.location.pathname}${window.location.search}`
}

function getFullPathFromLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const entrySequenceRef = useRef(0)
  const bypassGuardCountRef = useRef(0)
  const bypassTargetRoutePathRef = useRef<string | null>(null)
  const currentRoutePathRef = useRef('')
  const currentFullPathRef = useRef('')

  const [entries, setEntries] = useState<EntriesState>({})
  const entriesRef = useRef(entries)
  const pendingNavigationRef = useRef<PendingNavigation | null>(null)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

  const updateEntries = useCallback(
    (updater: (previous: EntriesState) => EntriesState) => {
      setEntries((previous) => {
        const next = updater(previous)
        entriesRef.current = next
        return next
      })
    },
    []
  )

  const registerEntry = useCallback(
    (entryId: string) => {
      updateEntries((previous) => {
        if (previous[entryId]) return previous
        return {
          ...previous,
          [entryId]: {
            dirty: false,
            isSaving: false,
            saveHandler: null,
            sequence: entrySequenceRef.current++,
          },
        }
      })
    },
    [updateEntries]
  )

  const unregisterEntry = useCallback(
    (entryId: string) => {
      updateEntries((previous) => {
        if (!previous[entryId]) return previous
        const { [entryId]: _, ...rest } = previous
        return rest
      })
    },
    [updateEntries]
  )

  const setEntryDirty = useCallback(
    (entryId: string, dirty: boolean) => {
      updateEntries((previous) => {
        const entry = previous[entryId]
        if (!entry || entry.dirty === dirty) return previous
        return {
          ...previous,
          [entryId]: { ...entry, dirty },
        }
      })
    },
    [updateEntries]
  )

  const setEntrySaving = useCallback(
    (entryId: string, saving: boolean) => {
      updateEntries((previous) => {
        const entry = previous[entryId]
        if (!entry || entry.isSaving === saving) return previous
        return {
          ...previous,
          [entryId]: { ...entry, isSaving: saving },
        }
      })
    },
    [updateEntries]
  )

  const setEntrySaveHandler = useCallback(
    (entryId: string, saveHandler: SaveHandler) => {
      updateEntries((previous) => {
        const entry = previous[entryId]
        if (!entry || entry.saveHandler === saveHandler) return previous
        return {
          ...previous,
          [entryId]: { ...entry, saveHandler },
        }
      })
    },
    [updateEntries]
  )

  const setEntryShouldBlockNavigation = useCallback(
    (
      entryId: string,
      shouldBlockNavigation: ShouldBlockNavigation | undefined
    ) => {
      updateEntries((previous) => {
        const entry = previous[entryId]
        if (!entry || entry.shouldBlockNavigation === shouldBlockNavigation) {
          return previous
        }
        return {
          ...previous,
          [entryId]: { ...entry, shouldBlockNavigation },
        }
      })
    },
    [updateEntries]
  )

  const allowNextNavigation = useCallback((targetPath?: string) => {
    if (typeof targetPath === 'string') {
      bypassTargetRoutePathRef.current = toRelativePath(targetPath).routePath
      return
    }
    bypassGuardCountRef.current += 1
  }, [])

  const dirtyEntries = useMemo(
    () => Object.values(entries).filter((entry) => entry.dirty),
    [entries]
  )
  const isDirty = dirtyEntries.length > 0

  const activeDirtyEntry = useMemo(() => {
    if (dirtyEntries.length === 0) return null
    const ordered = [...dirtyEntries].sort((a, b) => b.sequence - a.sequence)
    return ordered.find((entry) => entry.saveHandler != null) ?? ordered[0]
  }, [dirtyEntries])

  const queueBlockedNavigation = useCallback((next: PendingNavigation) => {
    pendingNavigationRef.current = next
    setIsConfirmDialogOpen(true)
  }, [])

  const shouldBlockTransition = useCallback(
    (targetPath: string, targetRoutePath: string): boolean => {
      if (targetRoutePath === currentRoutePathRef.current) return false
      if (
        bypassTargetRoutePathRef.current != null &&
        bypassTargetRoutePathRef.current === targetRoutePath
      ) {
        bypassTargetRoutePathRef.current = null
        return false
      }

      if (bypassGuardCountRef.current > 0) {
        bypassGuardCountRef.current -= 1
        return false
      }

      const currentDirtyEntries = Object.values(entriesRef.current).filter(
        (entry) => entry.dirty
      )
      if (currentDirtyEntries.length === 0) return false

      return currentDirtyEntries.some((entry) => {
        if (!entry.shouldBlockNavigation) return true
        try {
          return entry.shouldBlockNavigation(targetPath)
        } catch (error) {
          console.error(
            'Error in unsaved-changes shouldBlockNavigation callback:',
            error
          )
          return true
        }
      })
    },
    []
  )

  useEffect(() => {
    currentRoutePathRef.current = getRoutePathFromLocation()
    currentFullPathRef.current = getFullPathFromLocation()
    bypassGuardCountRef.current = 0
    bypassTargetRoutePathRef.current = null
  }, [pathname])

  useEffect(() => {
    const handleDocumentClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (!isPrimaryUnmodifiedClick(event)) return

      const eventTarget = event.target
      if (!(eventTarget instanceof Element)) return

      const anchor = eventTarget.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.dataset.unsavedIgnoreNavigation === 'true') return

      const parsed = toRelativePath(anchor.href)
      const anchorUrl = new URL(anchor.href, window.location.href)
      if (anchorUrl.origin !== window.location.origin) return

      if (!shouldBlockTransition(parsed.fullPath, parsed.routePath)) return

      event.preventDefault()
      queueBlockedNavigation({
        href: parsed.fullPath,
        replace: false,
      })
    }

    document.addEventListener('click', handleDocumentClickCapture, true)
    return () => {
      document.removeEventListener('click', handleDocumentClickCapture, true)
    }
  }, [queueBlockedNavigation, shouldBlockTransition])

  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history)
    const originalReplaceState = window.history.replaceState.bind(window.history)

    window.history.pushState = (data, unused, url) => {
      const parsed = resolveHistoryUrl(url)
      if (shouldBlockTransition(parsed.fullPath, parsed.routePath)) {
        queueBlockedNavigation({
          href: parsed.fullPath,
          replace: false,
        })
        return
      }
      originalPushState(data, unused, url)
      currentRoutePathRef.current = parsed.routePath
      currentFullPathRef.current = parsed.fullPath
    }

    window.history.replaceState = (data, unused, url) => {
      const parsed = resolveHistoryUrl(url)
      if (shouldBlockTransition(parsed.fullPath, parsed.routePath)) {
        queueBlockedNavigation({
          href: parsed.fullPath,
          replace: true,
        })
        return
      }
      originalReplaceState(data, unused, url)
      currentRoutePathRef.current = parsed.routePath
      currentFullPathRef.current = parsed.fullPath
    }

    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [queueBlockedNavigation, shouldBlockTransition])

  useEffect(() => {
    const handlePopState = () => {
      const parsed = toRelativePath(window.location.href)
      if (!shouldBlockTransition(parsed.fullPath, parsed.routePath)) {
        currentRoutePathRef.current = parsed.routePath
        currentFullPathRef.current = parsed.fullPath
        return
      }

      // popstate cannot be cancelled. Restore current URL deterministically and
      // then ask for confirmation before performing the transition.
      window.history.replaceState(window.history.state, '', currentFullPathRef.current)

      queueBlockedNavigation({
        href: parsed.fullPath,
        replace: false,
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [queueBlockedNavigation, shouldBlockTransition])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasDirtyEntries = Object.values(entriesRef.current).some(
        (entry) => entry.dirty
      )
      if (!hasDirtyEntries) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  useEffect(() => {
    if (!isDirty) {
      toast.dismiss(UNSAVED_CHANGES_TOAST_ID)
      if (pendingNavigationRef.current) {
        pendingNavigationRef.current = null
        setIsConfirmDialogOpen(false)
      }
      return
    }

    toast.message('Tienes cambios sin guardar', {
      id: UNSAVED_CHANGES_TOAST_ID,
      position: 'bottom-center',
      duration: Infinity,
      dismissible: false,
      action:
        activeDirtyEntry?.saveHandler != null ? (
          <Button
            size="sm"
            className="h-8"
            disabled={activeDirtyEntry.isSaving}
            onClick={() => {
              void activeDirtyEntry.saveHandler?.()
            }}
          >
            {activeDirtyEntry.isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando
              </>
            ) : (
              'Guardar cambios'
            )}
          </Button>
        ) : undefined,
    })
  }, [activeDirtyEntry, isDirty])

  const handleCancelNavigation = useCallback(() => {
    setIsConfirmDialogOpen(false)
    pendingNavigationRef.current = null
  }, [])

  const handleConfirmNavigation = useCallback(() => {
    const next = pendingNavigationRef.current
    if (!next) return

    pendingNavigationRef.current = null
    setIsConfirmDialogOpen(false)

    allowNextNavigation(next.href)
    if (next.replace) {
      router.replace(next.href)
    } else {
      router.push(next.href)
    }
  }, [allowNextNavigation, router])

  const contextValue = useMemo<UnsavedChangesContextValue>(
    () => ({
      entries,
      isDirty,
      registerEntry,
      unregisterEntry,
      setEntryDirty,
      setEntrySaving,
      setEntrySaveHandler,
      setEntryShouldBlockNavigation,
      allowNextNavigation,
    }),
    [
      entries,
      isDirty,
      registerEntry,
      unregisterEntry,
      setEntryDirty,
      setEntrySaving,
      setEntrySaveHandler,
      setEntryShouldBlockNavigation,
      allowNextNavigation,
    ]
  )

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}

      <Dialog
        open={isConfirmDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsConfirmDialogOpen(true)
            return
          }
          handleCancelNavigation()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Descartar cambios?</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar. Si continúas, se perderán los cambios
              pendientes de esta pantalla.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelNavigation}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmNavigation}>
              Descartar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  )
}

type UseUnsavedChangesOptions = {
  dirty?: boolean
  isSaving?: boolean
  onSave?: SaveHandler
  shouldBlockNavigation?: ShouldBlockNavigation
}

export function useUnsavedChanges(options?: UseUnsavedChangesOptions) {
  const context = useContext(UnsavedChangesContext)
  if (!context) {
    throw new Error('useUnsavedChanges must be used inside UnsavedChangesProvider')
  }
  const {
    entries,
    isDirty: hasDirtyEntries,
    registerEntry,
    unregisterEntry,
    setEntryDirty,
    setEntrySaving,
    setEntrySaveHandler,
    setEntryShouldBlockNavigation,
    allowNextNavigation,
  } = context

  const entryId = useId()

  useEffect(() => {
    registerEntry(entryId)
    return () => {
      unregisterEntry(entryId)
    }
  }, [entryId, registerEntry, unregisterEntry])

  useEffect(() => {
    if (typeof options?.dirty === 'boolean') {
      setEntryDirty(entryId, options.dirty)
    }
  }, [entryId, options?.dirty, setEntryDirty])

  useEffect(() => {
    if (typeof options?.isSaving === 'boolean') {
      setEntrySaving(entryId, options.isSaving)
    }
  }, [entryId, options?.isSaving, setEntrySaving])

  useEffect(() => {
    if (options?.onSave !== undefined) {
      setEntrySaveHandler(entryId, options.onSave)
    }
  }, [entryId, options?.onSave, setEntrySaveHandler])

  useEffect(() => {
    if (options?.shouldBlockNavigation !== undefined) {
      setEntryShouldBlockNavigation(entryId, options.shouldBlockNavigation)
    }
  }, [entryId, options?.shouldBlockNavigation, setEntryShouldBlockNavigation])

  const markDirty = useCallback(() => {
    setEntryDirty(entryId, true)
  }, [entryId, setEntryDirty])

  const markClean = useCallback(() => {
    setEntryDirty(entryId, false)
  }, [entryId, setEntryDirty])

  const setDirty = useCallback(
    (dirty: boolean) => {
      setEntryDirty(entryId, dirty)
    },
    [entryId, setEntryDirty]
  )

  const setSaving = useCallback(
    (saving: boolean) => {
      setEntrySaving(entryId, saving)
    },
    [entryId, setEntrySaving]
  )

  const setSaveHandler = useCallback(
    (saveHandler: SaveHandler) => {
      setEntrySaveHandler(entryId, saveHandler)
    },
    [entryId, setEntrySaveHandler]
  )

  const setShouldBlockNavigation = useCallback(
    (shouldBlockNavigation: ShouldBlockNavigation | undefined) => {
      setEntryShouldBlockNavigation(entryId, shouldBlockNavigation)
    },
    [entryId, setEntryShouldBlockNavigation]
  )

  return {
    isDirty: entries[entryId]?.dirty ?? false,
    hasDirtyEntries,
    markDirty,
    markClean,
    setDirty,
    setSaving,
    setSaveHandler,
    setShouldBlockNavigation,
    allowNextNavigation,
  }
}
