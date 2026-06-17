import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Host, Slider } from '@expo/ui/jetpack-compose'
import type { RatingSliderProps } from './rating-slider.types'

export function RatingSlider({
  value,
  min,
  max,
  color,
  onChange,
  isDark,
}: RatingSliderProps) {
  const [internal, setInternal] = useState(value ?? (min + max) / 2)

  useEffect(() => {
    if (value != null) setInternal(value)
  }, [value])

  // Discrete allowable values between the endpoints (integer steps of 1).
  const stepsBetween = Math.max(0, max - min - 1)

  return (
    <Host style={styles.host}>
      <Slider
        value={internal}
        min={min}
        max={max}
        steps={stepsBetween}
        onValueChange={(next) => {
          setInternal(next)
          onChange(Math.round(next))
        }}
        colors={{
          thumbColor: color,
          activeTrackColor: color,
          inactiveTrackColor: isDark ? '#3f3f46' : '#d4d4d8',
        }}
      />
    </Host>
  )
}

const styles = StyleSheet.create({
  host: {
    height: 44,
    width: '100%',
  },
})
