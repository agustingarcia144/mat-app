/**
 * Bridge for passing log-set modal result back to the workout screen.
 * Workout screen registers a callback; modal invokes it on save so the
 * update runs immediately without relying on focus events.
 */
export type PendingLogSetResult = {
  dayExId: string
  setIndex: number
  reps: number
  weight: number
  /** When true, apply the same reps and weight to all sets of the exercise */
  applyToAllSets?: boolean
  /** Optional duration in seconds (per exercise/session), if applicable */
  timeSeconds?: number
}

export type LogSetSaveCallback = (result: PendingLogSetResult) => void

let saveCallback: LogSetSaveCallback | null = null

export function setLogSetSaveCallback(cb: LogSetSaveCallback | null) {
  saveCallback = cb
}

export function invokeLogSetSaveCallback(result: PendingLogSetResult) {
  saveCallback?.(result)
  saveCallback = null
}
