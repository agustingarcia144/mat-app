import React, { createContext, useCallback, useContext, useState } from 'react'

type ExerciseVideoContextValue = {
  togglePlayPause: () => void
  isPlaying: boolean
  setVideoControls: (
    toggle: (() => void) | null,
    isPlaying: boolean
  ) => void
}

const noop = () => {}

const ExerciseVideoContext = createContext<ExerciseVideoContextValue>({
  togglePlayPause: noop,
  isPlaying: true,
  setVideoControls: noop,
})

export function ExerciseVideoProvider({ children }: { children: React.ReactNode }) {
  const [controls, setControls] = useState<{
    toggle: () => void
    isPlaying: boolean
  }>({ toggle: noop, isPlaying: true })

  const setVideoControls = useCallback(
    (toggle: (() => void) | null, isPlaying: boolean) => {
      setControls({
        toggle: toggle ?? noop,
        isPlaying,
      })
    },
    []
  )

  const value: ExerciseVideoContextValue = {
    togglePlayPause: controls.toggle,
    isPlaying: controls.isPlaying,
    setVideoControls,
  }

  return (
    <ExerciseVideoContext.Provider value={value}>
      {children}
    </ExerciseVideoContext.Provider>
  )
}

export function useExerciseVideo() {
  return useContext(ExerciseVideoContext)
}
