import React from 'react'
import { View, Text } from 'react-native'
import { ThemedText } from '@/components/ui/themed-text'
import { WEEKDAY_ES } from './constants'
import { AssignmentDetailExerciseRow } from './assignment-detail-exercise-row'
import { assignmentDetailStyles as styles } from './assignment-detail-styles'
import type { DayExerciseWithDetails } from './types'
import type { ExerciseBlock } from './types'

interface AssignmentDetailDayCardProps {
  day: { _id: string; name: string; dayOfWeek?: number }
  exercises: DayExerciseWithDetails[]
  dayBlocks: ExerciseBlock[]
  isDark: boolean
  muted: string
  cardBg: string
  cardBorder: string
  onExercisePress: (ex: DayExerciseWithDetails) => void
}

export function AssignmentDetailDayCard({
  day,
  exercises,
  dayBlocks,
  isDark,
  muted,
  cardBg,
  cardBorder,
  onExercisePress,
}: AssignmentDetailDayCardProps) {
  const exercisesUnblocked = exercises.filter((ex) => !ex.blockId)
  const unblockedSorted = [...exercisesUnblocked].sort((a, b) => a.order - b.order)

  return (
    <View
      style={[
        styles.dayCard,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
      ]}
    >
      <View style={styles.dayCardHeader}>
        <ThemedText style={styles.dayName}>{day.name}</ThemedText>
        {exercises.length > 0 && (
          <View
            style={[
              styles.dayBadge,
              {
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.06)',
              },
            ]}
          >
            <Text style={[styles.dayBadgeText, { color: muted }]}>
              {exercises.length}{' '}
              {exercises.length === 1 ? 'ejercicio' : 'ejercicios'}
            </Text>
          </View>
        )}
      </View>
      {day.dayOfWeek != null && WEEKDAY_ES[day.dayOfWeek] ? (
        <Text style={[styles.dayMeta, { color: muted }]}>
          {WEEKDAY_ES[day.dayOfWeek]}
        </Text>
      ) : null}
      {exercises.length === 0 ? (
        <Text style={[styles.noExercises, { color: muted }]}>
          Sin ejercicios
        </Text>
      ) : (
        <View style={styles.exerciseGroups}>
          {dayBlocks.map((block) => {
            const blockExercises = exercises
              .filter((ex) => ex.blockId === block._id)
              .sort((a, b) => a.order - b.order)
            if (blockExercises.length === 0) return null
            return (
              <View key={block._id} style={styles.blockGroup}>
                <View style={styles.blockHeader}>
                  <ThemedText style={styles.blockTitle}>{block.name}</ThemedText>
                  <View
                    style={[
                      styles.blockBadge,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(0,0,0,0.06)',
                      },
                    ]}
                  >
                    <Text style={[styles.blockBadgeText, { color: muted }]}>
                      {blockExercises.length}{' '}
                      {blockExercises.length === 1 ? 'ejercicio' : 'ejercicios'}
                    </Text>
                  </View>
                </View>
                <View style={styles.exerciseList}>
                  {blockExercises.map((ex) => (
                    <AssignmentDetailExerciseRow
                      key={ex._id}
                      ex={ex}
                      isDark={isDark}
                      muted={muted}
                      onPress={() => onExercisePress(ex)}
                    />
                  ))}
                </View>
              </View>
            )
          })}
          {unblockedSorted.length > 0 && (
            <View style={styles.blockGroup}>
              <View style={styles.blockHeader}>
                <ThemedText style={styles.blockTitle}>Ejercicios</ThemedText>
                <View
                  style={[
                    styles.blockBadge,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255,255,255,0.12)'
                        : 'rgba(0,0,0,0.06)',
                    },
                  ]}
                >
                  <Text style={[styles.blockBadgeText, { color: muted }]}>
                    {unblockedSorted.length}{' '}
                    {unblockedSorted.length === 1 ? 'ejercicio' : 'ejercicios'}
                  </Text>
                </View>
              </View>
              <View style={styles.exerciseList}>
                {unblockedSorted.map((ex) => (
                  <AssignmentDetailExerciseRow
                    key={ex._id}
                    ex={ex}
                    isDark={isDark}
                    muted={muted}
                    onPress={() => onExercisePress(ex)}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
