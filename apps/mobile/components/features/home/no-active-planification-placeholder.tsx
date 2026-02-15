import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ThemedText } from '@/components/ui/themed-text'
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
      <ThemedText style={styles.emptyText}>
        No tienes una planificación activa
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        Ve a Planificaciones para ver tus rutinas
      </ThemedText>
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
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    textAlign: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
