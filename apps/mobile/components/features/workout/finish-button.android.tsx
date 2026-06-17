import React from 'react'
import { StyleSheet } from 'react-native'
import { Button, Host, Text } from '@expo/ui/jetpack-compose'
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers'
import type { FinishButtonProps } from './finish-button.types'

export function FinishButton({
  label,
  loadingLabel,
  onPress,
  loading,
  disabled,
  isDark,
}: FinishButtonProps) {
  const background = isDark ? '#fafafa' : '#18181b'
  const foreground = isDark ? '#18181b' : '#fafafa'
  const isDisabled = !!disabled || !!loading

  return (
    <Host style={styles.host}>
      <Button
        onClick={onPress}
        enabled={!isDisabled}
        modifiers={[fillMaxWidth()]}
        colors={{
          containerColor: background,
          contentColor: foreground,
          disabledContainerColor: isDark ? '#27272a' : '#e4e4e7',
          disabledContentColor: isDark ? '#71717a' : '#a1a1aa',
        }}
      >
        <Text style={{ fontWeight: 'bold' }}>{loading ? (loadingLabel ?? label) : label}</Text>
      </Button>
    </Host>
  )
}

const styles = StyleSheet.create({
  host: {
    height: 52,
    width: '100%',
  },
})
