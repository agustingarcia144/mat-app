import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Host, Slider } from '@expo/ui/swift-ui'
import { tint } from '@expo/ui/swift-ui/modifiers'
import type { RatingSliderProps } from './rating-slider.types'

export function RatingSlider({
  value,
  min,
  max,
  color,
  onChange,
}: RatingSliderProps) {
  const [internal, setInternal] = useState(value ?? (min + max) / 2)

  useEffect(() => {
    if (value != null) setInternal(value)
  }, [value])

  return (
    <Host style={styles.host} matchContents>
      <Slider
        value={internal}
        min={min}
        max={max}
        step={1}
        modifiers={[tint(color)]}
        onValueChange={(next) => {
          setInternal(next)
          onChange(Math.round(next))
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
