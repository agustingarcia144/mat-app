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
  timeSeconds?: number
  notes?: string
  order: number
  exercise?: {
    name?: string
    videoUrl?: string
  }
}

function formatTime(timeSeconds?: number) {
  if (timeSeconds == null || timeSeconds <= 0) return ''
  if (timeSeconds < 60) return `${timeSeconds}s`
  const mins = Math.round(timeSeconds / 60)
  return `${mins}min`
}

function formatLoad(
  weight?: string,
  prPercentage?: number,
  timeSeconds?: number
) {
  const parts: string[] = []
  if (weight?.trim()) parts.push(weight.trim())
  if (prPercentage != null && prPercentage > 0)
    parts.push(`${prPercentage}% PR`)
  const time = formatTime(timeSeconds)
  if (time) parts.push(time)
  return parts.join(' · ')
}

export interface ExerciseCardProps {
  dayEx: DayExerciseForCard
  values: { reps: string; weight: string }[]
  timeValues?: number[]
  supportsTime?: boolean
  hasLoggedData: boolean
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
  onQuickCompleteSet: (setIndex: number) => void
  isSetQuickCompleted?: (setIndex: number) => boolean
}

export function ExerciseCard({
  dayEx,
  values,
  timeValues,
  supportsTime = false,
  hasLoggedData,
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
  onQuickCompleteSet,
  isSetQuickCompleted,
}: ExerciseCardProps) {
  const thumbnailUrl = dayEx.exercise?.videoUrl
    ? getVideoThumbnailUrl(dayEx.exercise.videoUrl)
    : null
  const hasThumbnail = !!thumbnailUrl
  const overlayTextColor = hasThumbnail ? '#fff' : inputColor
  const loadLabel = formatLoad(
    dayEx.weight,
    dayEx.prPercentage,
    dayEx.timeSeconds
  )
  const notesLabel = dayEx.notes?.trim()
  const hasTime =
    supportsTime || (timeValues?.some((value) => value != null && value > 0) ?? false)

  const isExerciseCompleted =
    hasLoggedData &&
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
        <View style={styles.cardFooterContent}>
          <Text
            style={[
              styles.cardFooterLabel,
              { color: isDark ? '#fff' : '#000' },
            ]}
          >
            Series {dayEx.sets} × {dayEx.reps}
            {loadLabel ? ` · ${loadLabel}` : ''}
          </Text>
          {notesLabel ? (
            <Text
              style={[
                styles.cardFooterNotes,
                { color: isDark ? '#d4d4d8' : '#52525b' },
              ]}
              numberOfLines={2}
            >
              Comentarios: {notesLabel}
            </Text>
          ) : null}
        </View>
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
                const setTimeSeconds = Math.max(0, timeValues?.[setIndex] ?? 0)
                const formattedSetTime = formatTime(setTimeSeconds)
                const setWasQuickCompleted = !!isSetQuickCompleted?.(setIndex)
                const hasLoggedSetData =
                  hasLoggedData &&
                  (setWasQuickCompleted ||
                    setValues.reps?.trim().length > 0 ||
                    setValues.weight?.trim().length > 0)
                const isSetCompleted =
                  hasLoggedSetData &&
                  (setWasQuickCompleted ||
                    (setValues.reps?.trim().length > 0 &&
                      setValues.weight?.trim().length > 0))
                return (
                  <View key={`set-${setIndex}`} style={styles.setRow}>
                    <View
                      style={[
                        styles.setInputs,
                        hasTime && styles.setInputsCompact,
                      ]}
                    >
                      <PressableScale
                        onPress={() => onPressSet(setIndex)}
                        style={[
                          styles.setInputsPressable,
                          isNewSession && styles.setInputsPressableDisabled,
                        ]}
                      >
                        <View
                          style={[
                            styles.setInputGroup,
                            hasTime && styles.setInputGroupCompact,
                          ]}
                        >
                          <ThemedText style={styles.inputLabel}>
                            Reps
                          </ThemedText>
                          <View
                            style={[
                              styles.input,
                              hasTime && styles.inputCompact,
                              { backgroundColor: inputBg },
                            ]}
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
                        <View
                          style={[
                            styles.setInputGroup,
                            hasTime && styles.setInputGroupCompact,
                          ]}
                        >
                          <ThemedText style={styles.inputLabel}>
                            Peso
                          </ThemedText>
                          <View
                            style={[
                              styles.input,
                              hasTime && styles.inputCompact,
                              { backgroundColor: inputBg },
                            ]}
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
                        {hasTime && (
                          <View
                            style={[
                              styles.setInputGroup,
                              styles.setInputGroupCompact,
                            ]}
                          >
                            <ThemedText style={styles.inputLabel}>
                              Tiempo
                            </ThemedText>
                            <View
                              style={[
                                styles.input,
                                styles.inputCompact,
                                { backgroundColor: inputBg },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.inputValue,
                                  {
                                    color: formattedSetTime
                                      ? inputColor
                                      : isDark
                                        ? '#71717a'
                                        : '#a1a1aa',
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {formattedSetTime || '0s'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </PressableScale>
                      <View style={styles.statusColumn}>
                        <View style={styles.statusSpacer} />
                        <View style={styles.statusIconContainer}>
                          <PressableScale
                            onPress={
                              isNewSession || isCompleted
                                ? undefined
                                : () => onQuickCompleteSet(setIndex)
                            }
                            style={styles.statusIconPressable}
                          >
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
                          </PressableScale>
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
    maxWidth: 290,
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
  expandedNotes: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardFooterContent: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  cardFooterLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardFooterNotes: {
    fontSize: 12,
    marginTop: 4,
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
  setInputsCompact: {
    maxWidth: '100%',
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
  setInputGroupCompact: {
    flexBasis: 0,
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
  statusIconPressable: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
  inputCompact: {
    paddingHorizontal: 8,
  },
  inputValue: {
    fontSize: 16,
  },
})
