import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { EmptyState } from '@/components/ui/empty-state'
import { ThemedPressable } from '@/components/ui/themed-pressable'

export interface NoActivePlanificationPlaceholderProps {
  onPress: () => void
  isDark: boolean
}

export function NoActivePlanificationPlaceholder({
  onPress,
  isDark,
}: NoActivePlanificationPlaceholderProps) {
  return (
    <View style={[styles.placeholder, styles.centered]}>
      <EmptyState
        title="No tienes una planificación activa"
        description="Ve a Planificaciones para ver tus rutinas"
        imageSize={100}
      >
        <ThemedPressable
          type="primary"
          onPress={onPress}
          style={{ paddingHorizontal: 12 }}
        >
          <Text
            style={[
              styles.primaryButtonText,
              { color: isDark ? '#000' : '#fff' },
            ]}
          >
            Ver planificaciones
          </Text>
        </ThemedPressable>
      </EmptyState>
    </View>
  )
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    padding: 24,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
