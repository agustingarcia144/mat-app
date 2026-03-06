import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { BadgeColors } from '@/constants/theme'

export interface NoActivePlanAlertProps {
  onPress: () => void
  isDark: boolean
}

export function NoActivePlanAlert({ onPress, isDark }: NoActivePlanAlertProps) {
  const colors = BadgeColors.warning[isDark ? 'dark' : 'light']

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg },
      ]}
    >
      <Text style={[styles.text, { color: colors.text }]}>
        No tienes una planificación activa
      </Text>
      <ThemedPressable
        type="primary"
        onPress={onPress}
        style={styles.button}
      >
        <Text
          style={[
            styles.buttonText,
            { color: isDark ? '#000' : '#fff' },
          ]}
        >
          Ver planificaciones
        </Text>
      </ThemedPressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginHorizontal: 16,
    gap: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  button: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: 999,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
