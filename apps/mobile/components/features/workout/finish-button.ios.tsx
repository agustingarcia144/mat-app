import React from 'react'
import { StyleSheet } from 'react-native'
import { Button, Host, Text } from '@expo/ui/swift-ui'
import {
  bold,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers'
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
        onPress={onPress}
        modifiers={[
          buttonStyle('borderedProminent'),
          controlSize('large'),
          tint(background),
          disabledModifier(isDisabled),
        ]}
      >
        <Text
          modifiers={[
            foregroundStyle(foreground),
            frame({ maxWidth: Infinity, minHeight: 28 }),
            bold(),
          ]}
        >
          {loading ? (loadingLabel ?? label) : label}
        </Text>
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
