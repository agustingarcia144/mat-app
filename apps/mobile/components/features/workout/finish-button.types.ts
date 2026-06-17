export type FinishButtonProps = {
  label: string
  /** Shown while `loading` is true (falls back to `label`). */
  loadingLabel?: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  isDark: boolean
}
