import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ThemedText } from '@/components/themed-text'

interface ClassesEmptyStateProps {
  paddingBottom: number
}

export function ClassesEmptyState({ paddingBottom }: ClassesEmptyStateProps) {
  return (
    <View style={[styles.emptyBlock, { paddingBottom }]}>
      <ThemedText style={styles.emptyText}>
        No hay clases programadas
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        Consultá más tarde o hablá con tu gimnasio
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  emptyBlock: {
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    textAlign: 'center',
  },
})
