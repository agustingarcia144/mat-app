import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { PressableScale } from 'pressto'
import type { RatingSliderProps } from './rating-slider.types'

/**
 * Plain React Native fallback (web / platforms without the native @expo/ui
 * slider). Renders the range as a row of pressable pills.
 */
export function RatingSlider({
  value,
  min,
  max,
  color,
  onChange,
  isDark,
}: RatingSliderProps) {
  const cardBg = isDark ? '#18181b' : '#f4f4f5'
  const borderColor = isDark ? '#27272a' : '#e4e4e7'
  const textColor = isDark ? '#fafafa' : '#18181b'

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  return (
    <View style={styles.row}>
      {values.map((option) => {
        const selected = value === option
        return (
          <PressableScale
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.button,
              {
                backgroundColor: selected ? color : cardBg,
                borderColor: selected ? color : borderColor,
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                { color: selected ? '#ffffff' : textColor },
              ]}
            >
              {option}
            </Text>
          </PressableScale>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
})
