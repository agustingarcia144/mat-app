import React from 'react'
import { View } from 'react-native'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { assignmentDetailStyles as styles } from './assignment-detail-styles'

interface AssignmentDetailNotFoundProps {
  paddingTop: number
}

export function AssignmentDetailNotFound({
  paddingTop,
}: AssignmentDetailNotFoundProps) {
  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, styles.hero, { paddingTop }]}>
        <ThemedText type="title" style={styles.heroTitle}>
          No encontrada
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Esta planificación no existe o no tienes acceso.
        </ThemedText>
      </View>
    </ThemedView>
  )
}

interface AssignmentDetailEmptyCardProps {
  message: string
  muted: string
}

export function AssignmentDetailEmptyCard({
  message,
  muted,
}: AssignmentDetailEmptyCardProps) {
  return (
    <View style={styles.emptyCard}>
      <ThemedText style={[styles.emptyText, { color: muted }]}>
        {message}
      </ThemedText>
    </View>
  )
}
