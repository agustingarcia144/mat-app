import * as React from 'react'

const NOOP_SUBSCRIBE = () => () => {}

export function useMediaQuery(query: string, serverFallback = false) {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {}

    const mediaQueryList = window.matchMedia(query)
    const listener = () => onStoreChange()
    mediaQueryList.addEventListener('change', listener)

    return () => mediaQueryList.removeEventListener('change', listener)
  }, [query])

  const getSnapshot = React.useCallback(() => {
    if (typeof window === 'undefined') return serverFallback
    return window.matchMedia(query).matches
  }, [query, serverFallback])

  return React.useSyncExternalStore(
    typeof window === 'undefined' ? NOOP_SUBSCRIBE : subscribe,
    getSnapshot,
    () => serverFallback
  )
}
