import React from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native'
import { PressableScale } from 'pressto'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { LinearGradient } from 'expo-linear-gradient'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { ThemedText } from '@/components/ui/themed-text'

export interface DayExerciseForCard {
  _id: string
  exerciseId: string
  sets: number
  reps: string
  weight?: string
  prPercentage?: number
  order: number
  exercise?: {
    name?: string
    videoUrl?: string
  }
}

function formatLoad(weight?: string, prPercentage?: number) {
  if (weight?.trim()) return weight.trim()
  if (prPercentage != null && prPercentage > 0) return `${prPercentage}% PR`
  return ''
}

export interface ExerciseCardProps {
  dayEx: DayExerciseForCard
  values: { reps: string; weight: string }[]
  saving: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  isNewSession: boolean
  isCompleted: boolean
  inputBg: string
  inputColor: string
  borderColor: string
  isDark: boolean
  onPressExercise: () => void
  onPressSet: (setIndex: number) => void
}

export function ExerciseCard({
  dayEx,
  values,
  saving,
  isExpanded,
  onToggleExpand,
  isNewSession,
  isCompleted,
  inputBg,
  inputColor,
  borderColor,
  isDark,
  onPressExercise,
  onPressSet,
}: ExerciseCardProps) {
  const thumbnailUrl = dayEx.exercise?.videoUrl
    ? getVideoThumbnailUrl(dayEx.exercise.videoUrl)
    : null
  const hasThumbnail = !!thumbnailUrl
  const overlayTextColor = hasThumbnail ? '#fff' : inputColor
  const loadLabel = formatLoad(dayEx.weight, dayEx.prPercentage)

  const isExerciseCompleted =
    values.length >= dayEx.sets &&
    values.every(
      (set) => set.reps?.trim().length > 0 && set.weight?.trim().length > 0
    )

  return (
    <View style={[styles.exerciseCard, { borderColor }]}>
      {/* 1. Thumbnail with title (top) */}
      <PressableScale onPress={onPressExercise} style={styles.thumbnailSection}>
        {hasThumbnail ? (
          <Image
            source={{ uri: thumbnailUrl ?? undefined }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
          />
        )}
        {hasThumbnail && (
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.4, 1]}
            style={styles.thumbnailGradient}
          />
        )}
        {isExerciseCompleted && (
          <View style={styles.exerciseCompletedBadge}>
            <MaterialIcons name="check-circle" size={28} color="#22c55e" />
          </View>
        )}
        <View style={styles.exerciseHeaderOverlay}>
          {saving && !isExerciseCompleted && (
            <ActivityIndicator
              size="small"
              color="rgba(255,255,255,0.9)"
              style={styles.savingIndicatorOverlay}
            />
          )}
          <View style={styles.exerciseNameContainer}>
            <Text
              style={[styles.exerciseNameOverlay, { color: overlayTextColor }]}
              numberOfLines={2}
            >
              {dayEx.exercise?.name ?? 'Ejercicio'}
            </Text>
          </View>
        </View>
      </PressableScale>
      {/* 2. Expandable trigger (black bar) */}
      <PressableScale
        onPress={onToggleExpand}
        style={[
          styles.cardFooter,
          { backgroundColor: isDark ? '#18181b' : '#f4f4f5' },
        ]}
      >
        <Text
          style={[styles.cardFooterLabel, { color: isDark ? '#fff' : '#000' }]}
        >
          Series {dayEx.sets} × {dayEx.reps}
          {loadLabel ? ` · ${loadLabel}` : ''}
        </Text>
        <MaterialIcons
          name={isExpanded ? 'keyboard-arrow-down' : 'keyboard-arrow-up'}
          size={24}
          color={isDark ? '#fff' : '#000'}
        />
      </PressableScale>
      {/* 3. Expandable section (sets grid) */}
      {isExpanded && (
        <View
          style={[
            styles.setsGridWrapper,
            { backgroundColor: isDark ? '#18181b' : '#f4f4f5' },
          ]}
        >
          <View style={styles.setsGrid}>
            <View style={styles.setsColumn}>
              {Array.from({ length: dayEx.sets }).map((_, setIndex) => {
                const setValues = values[setIndex] ?? { reps: '', weight: '' }
                const isSetCompleted =
                  setValues.reps?.trim().length > 0 &&
                  setValues.weight?.trim().length > 0
                return (
                  <View key={`set-${setIndex}`} style={styles.setRow}>
                    <View style={styles.setInputs}>
                      <PressableScale
                        onPress={() => onPressSet(setIndex)}
                        style={[
                          styles.setInputsPressable,
                          (isNewSession || isCompleted) &&
                            styles.setInputsPressableDisabled,
                        ]}
                      >
                        <View style={styles.setInputGroup}>
                          <ThemedText style={styles.inputLabel}>
                            Reps
                          </ThemedText>
                          <View
                            style={[styles.input, { backgroundColor: inputBg }]}
                          >
                            <Text
                              style={[
                                styles.inputValue,
                                {
                                  color: setValues.reps
                                    ? inputColor
                                    : isDark
                                      ? '#71717a'
                                      : '#a1a1aa',
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {setValues.reps || '0'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.setInputGroup}>
                          <ThemedText style={styles.inputLabel}>
                            Peso
                          </ThemedText>
                          <View
                            style={[styles.input, { backgroundColor: inputBg }]}
                          >
                            <Text
                              style={[
                                styles.inputValue,
                                {
                                  color: setValues.weight
                                    ? inputColor
                                    : isDark
                                      ? '#71717a'
                                      : '#a1a1aa',
                                },
                              ]}
                              numberOfLines={1}
                            >
                              {setValues.weight || 'kg'}
                            </Text>
                          </View>
                        </View>
                      </PressableScale>
                      <View style={styles.statusColumn}>
                        <View style={styles.statusSpacer} />
                        <View style={styles.statusIconContainer}>
                          <MaterialIcons
                            name={
                              isSetCompleted
                                ? 'check-circle'
                                : 'radio-button-unchecked'
                            }
                            size={24}
                            color={
                              isSetCompleted
                                ? '#22c55e'
                                : isDark
                                  ? '#71717a'
                                  : '#a1a1aa'
                            }
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  exerciseCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  thumbnailSection: {
    height: 200,
    position: 'relative',
    overflow: 'hidden',
  },
  thumbnailGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
  },
  exerciseHeaderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 16,
  },
  exerciseCompletedBadge: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 1,
  },
  savingIndicatorOverlay: {
    position: 'absolute',
    top: 12,
    right: 16,
  },
  exerciseNameContainer: {
    alignSelf: 'flex-start',
  },
  exerciseNameOverlay: {
    fontSize: 18,
    fontWeight: '700',
  },
  setsGridWrapper: {
    padding: 16,
    paddingTop: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardFooterLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  setsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  setsColumn: {
    flex: 1,
    gap: 12,
  },
  setRow: {
    gap: 8,
  },
  setInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  setInputsPressable: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  setInputsPressableDisabled: {
    opacity: 0.6,
  },
  setInputGroup: {
    flex: 1,
    minWidth: 0,
  },
  statusColumn: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: 40,
    flexShrink: 0,
  },
  statusSpacer: {
    height: 20,
  },
  statusIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    opacity: 0.8,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  inputValue: {
    fontSize: 16,
  },
})
