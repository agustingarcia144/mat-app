export type RatingSliderProps = {
  /** Current value within [min, max], or null when nothing is chosen yet. */
  value: number | null
  min: number
  max: number
  /** Active-track + thumb color (driven by the current value). */
  color: string
  onChange: (value: number) => void
  isDark: boolean
}

function lerpChannel(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t)
}

// Green -> amber -> red gradient stops.
const GREEN = [34, 197, 94]
const AMBER = [245, 158, 11]
const RED = [239, 68, 68]

/**
 * Maps a 0..1 intensity to a red↔green gradient color.
 * `0` = green (easy / great), `1` = red (max effort / exhausted).
 */
export function ratingColor(intensity: number): string {
  const clamped = Math.min(1, Math.max(0, intensity))
  const [from, to, t] =
    clamped < 0.5
      ? [GREEN, AMBER, clamped / 0.5]
      : [AMBER, RED, (clamped - 0.5) / 0.5]
  const r = lerpChannel(from[0], to[0], t)
  const g = lerpChannel(from[1], to[1], t)
  const b = lerpChannel(from[2], to[2], t)
  const toHex = (channel: number) => channel.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
