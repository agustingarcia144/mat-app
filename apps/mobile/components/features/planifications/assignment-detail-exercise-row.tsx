import React from 'react'
import { View, Text, Image } from 'react-native'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { ThemedText } from '@/components/ui/themed-text'
import { assignmentDetailStyles as styles } from './assignment-detail-styles'
import type { DayExerciseWithDetails } from './types'
import { PressableScale } from 'pressto'

function formatLoad(weight?: string, prPercentage?: number) {
  if (weight?.trim()) return weight.trim()
  if (prPercentage != null && prPercentage > 0) return `${prPercentage}% PR`
  return ''
}

interface AssignmentDetailExerciseRowProps {
  ex: DayExerciseWithDetails
  isDark: boolean
  muted: string
  onPress: () => void
}

export function AssignmentDetailExerciseRow({
  ex,
  isDark,
  muted,
  onPress,
}: AssignmentDetailExerciseRowProps) {
  const thumbnailUrl = ex.exercise?.videoUrl
    ? getVideoThumbnailUrl(ex.exercise.videoUrl)
    : null
  const loadLabel = formatLoad(ex.weight, ex.prPercentage)
  const notesLabel = ex.notes?.trim()

  return (
    <PressableScale
      style={[
        styles.exerciseRow,
        {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.04)'
            : 'rgba(0,0,0,0.02)',
          borderRadius: 10,
          padding: 12,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ex.exercise?.name ?? 'Ejercicio'}
    >
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={[
            styles.exerciseThumbnail,
            {
              backgroundColor: isDark ? '#3f3f46' : '#e4e4e7',
            },
          ]}
          resizeMode="cover"
        />
      ) : (
        <Image
          source={require('@/assets/images/mat-wolf-looking.png')}
          style={[
            styles.exerciseThumbnail,
            {
              backgroundColor: isDark ? '#000' : '#fff',
            },
          ]}
          resizeMode="cover"
        />
      )}
      <View style={styles.exerciseContent}>
        <ThemedText style={styles.exerciseName}>
          {ex.exercise?.name ?? 'Ejercicio'}
        </ThemedText>
        <Text style={[styles.exerciseMeta, { color: muted }]}>
          {ex.sets} × {ex.reps}
          {loadLabel ? ` · ${loadLabel}` : ''}
        </Text>
        {notesLabel ? (
          <Text
            style={[styles.exerciseMeta, { color: muted, marginTop: 2 }]}
            numberOfLines={2}
          >
            Comentarios: {notesLabel}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  )
}
