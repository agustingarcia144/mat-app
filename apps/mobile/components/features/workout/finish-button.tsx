import React from 'react'
import { ActivityIndicator, StyleSheet, Text } from 'react-native'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import type { FinishButtonProps } from './finish-button.types'

/**
 * Plain React Native fallback (web / platforms without the native @expo/ui
 * button). Uses the shared themed primary pressable.
 */
export function FinishButton({
  label,
  loadingLabel,
  onPress,
  loading,
  disabled,
  isDark,
}: FinishButtonProps) {
  return (
    <ThemedPressable
      type="primary"
      onPress={onPress}
      disabled={!!disabled || !!loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
      ) : (
        <Text style={[styles.text, { color: isDark ? '#000' : '#fff' }]}>
          {loading ? (loadingLabel ?? label) : label}
        </Text>
      )}
    </ThemedPressable>
  )
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    fontWeight: '700',
  },
})
