'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'

type LibraryExerciseNamesContextValue = {
  setNames: (names: Record<string, string>) => void
  getName: (id: string) => string | undefined
}

const LibraryExerciseNamesContext =
  createContext<LibraryExerciseNamesContextValue | null>(null)

export function LibraryExerciseNamesProvider({
  children,
}: {
  children: ReactNode
}) {
  const namesRef = useRef<Record<string, string>>({})

  const setNames = useCallback((names: Record<string, string>) => {
    namesRef.current = names
  }, [])

  const getName = useCallback((id: string) => {
    return namesRef.current[id]
  }, [])

  const value = useMemo(() => ({ setNames, getName }), [setNames, getName])

  return (
    <LibraryExerciseNamesContext.Provider value={value}>
      {children}
    </LibraryExerciseNamesContext.Provider>
  )
}

export function useLibraryExerciseNames() {
  const ctx = useContext(LibraryExerciseNamesContext)
  return ctx
}
