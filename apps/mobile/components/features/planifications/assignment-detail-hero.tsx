import React from 'react'
import { View, Text } from 'react-native'
import { ThemedText } from '@/components/ui/themed-text'
import { assignmentDetailStyles as styles } from './assignment-detail-styles'

interface AssignmentDetailHeroProps {
  name: string
  weeksCount: number
  dateRange: string | null
  description: string | null
  muted: string
}

export function AssignmentDetailHero({
  name,
  weeksCount,
  dateRange,
  description,
  muted,
}: AssignmentDetailHeroProps) {
  return (
    <View style={styles.hero}>
      <ThemedText type="title" style={styles.heroTitle}>
        {name}
      </ThemedText>
      <View style={styles.heroMeta}>
        <Text style={[styles.heroMetaText, { color: muted }]}>
          {weeksCount === 1 ? '1 semana' : `${weeksCount} semanas`}
          {dateRange ? ` · ${dateRange}` : ''}
        </Text>
      </View>
      {description ? (
        <ThemedText style={[styles.heroDescription, { color: muted }]}>
          {description}
        </ThemedText>
      ) : null}
    </View>
  )
}
