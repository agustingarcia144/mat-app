import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { EmptyState } from '@/components/ui/empty-state'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { ThemedText } from '@/components/ui/themed-text'

export interface NoActivePlanificationPlaceholderProps {
  onPress: () => void
  isDark: boolean
  /** When true, render a compact CTA (e.g. below week calendar) instead of full empty state */
  compact?: boolean
}

export function NoActivePlanificationPlaceholder({
  onPress,
  isDark,
  compact = false,
}: NoActivePlanificationPlaceholderProps) {
  if (compact) {
    return (
      <View style={styles.compactRoot}>
        <ThemedText type="default" style={styles.compactText}>
          No tienes una planificación activa
        </ThemedText>
        <ThemedPressable
          type="primary"
          onPress={onPress}
          style={styles.compactButton}
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
      </View>
    )
  }

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
          style={{ paddingHorizontal: 24 }}
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
  compactRoot: {
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128, 128, 128, 0.3)',
    alignItems: 'center',
    gap: 12,
  },
  compactText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.9,
  },
  compactButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
