import React, { useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { addDays, endOfWeek, format, getISODay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import { IconSymbol } from '../../ui/icon-symbol'

const SWIPE_THRESHOLD = 50
const VELOCITY_THRESHOLD = 400
const PAN_ACTIVE_OFFSET_X = 25
const SLIDE_OUT_DISTANCE = 280
const WHEEL_DURATION_MS = 220

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const }

/** Get Monday and Sunday of the week containing `date` */
function getWeekRange(date: Date): { monday: Date; sunday: Date } {
  return {
    monday: startOfWeek(date, WEEK_STARTS_MONDAY),
    sunday: endOfWeek(date, WEEK_STARTS_MONDAY),
  }
}

/** Short day names (Mon–Sun) in Spanish, for use as column labels */
const SHORT_DAY_NAMES = (() => {
  const monday = new Date(2024, 0, 1) // 2024-01-01 is Monday
  return [0, 1, 2, 3, 4, 5, 6].map((i) =>
    format(addDays(monday, i), 'EEE', { locale: es })
  )
})()

type CalendarWeekViewProps = {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  onWeekChange: (date: Date) => void
  weekSessions?: {
    performedOn: string
    status: string
  }[]
  workoutDays?: {
    dayOfWeek?: number
    [key: string]: unknown
  }[]
  /** YMD strings (yyyy-MM-dd) for days that have at least one reserved class */
  daysWithClasses?: string[]
  /** YMD strings (yyyy-MM-dd) for days that have at least one attended class */
  daysWithAttendedClasses?: string[]
}

export function CalendarWeekView({
  selectedDate,
  onDateSelect,
  onWeekChange,
  weekSessions,
  workoutDays,
  daysWithClasses,
  daysWithAttendedClasses,
}: CalendarWeekViewProps) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const { monday } = useMemo(() => getWeekRange(selectedDate), [selectedDate])

  const weekDays = useMemo(() => {
    const days: { date: Date; label: string; ymd: string }[] = []
    const curr = new Date(monday)
    for (let i = 0; i < 7; i++) {
      days.push({
        date: new Date(curr),
        label: SHORT_DAY_NAMES[i],
        ymd: format(curr, 'yyyy-MM-dd'),
      })
      curr.setDate(curr.getDate() + 1)
    }
    return days
  }, [monday])

  const selectedYmd = format(selectedDate, 'yyyy-MM-dd')

  const completedForDay = (ymd: string) => {
    const completedWorkout =
      weekSessions?.some(
        (s) => s.performedOn === ymd && s.status === 'completed'
      ) ?? false
    const completedClass = daysWithAttendedClasses?.includes(ymd) ?? false
    return completedWorkout || completedClass
  }

  const inProgressForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === 'started'
    ) ?? false

  const hasScheduledWorkout = (isoWeekday: number) =>
    workoutDays?.some(
      (d) => d.dayOfWeek !== undefined && d.dayOfWeek === isoWeekday
    ) ?? false

  const hasClassOnDay = (ymd: string) => daysWithClasses?.includes(ymd) ?? false

  const handlePreviousWeek = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 7)
    onWeekChange(newDate)
  }, [selectedDate, onWeekChange])

  const handleNextWeek = useCallback(() => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 7)
    onWeekChange(newDate)
  }, [selectedDate, onWeekChange])

  const dragX = useSharedValue(0)

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
        .onUpdate((e) => {
          dragX.value = e.translationX
        })
        .onEnd((e) => {
          const goPrev =
            e.translationX > SWIPE_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD
          const goNext =
            e.translationX < -SWIPE_THRESHOLD ||
            e.velocityX < -VELOCITY_THRESHOLD
          if (goPrev) {
            dragX.value = withTiming(
              SLIDE_OUT_DISTANCE,
              { duration: WHEEL_DURATION_MS },
              (finished) => {
                if (finished) {
                  scheduleOnRN(handlePreviousWeek)
                  dragX.value = 0
                }
              }
            )
          } else if (goNext) {
            dragX.value = withTiming(
              -SLIDE_OUT_DISTANCE,
              { duration: WHEEL_DURATION_MS },
              (finished) => {
                if (finished) {
                  scheduleOnRN(handleNextWeek)
                  dragX.value = 0
                }
              }
            )
          } else {
            dragX.value = withTiming(0, { duration: 180 })
          }
        }),
    [handlePreviousWeek, handleNextWeek, dragX]
  )

  const animatedStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }))

  const arrowColor = isDark ? '#fff' : '#000'

  const monthYearLabel = useMemo(() => {
    const str = selectedDate.toLocaleDateString('es', {
      month: 'long',
      year: 'numeric',
    })
    return str.charAt(0).toUpperCase() + str.slice(1)
  }, [selectedDate])

  return (
    <View style={styles.wrapper}>
      <Text
        style={[styles.monthYear, { color: isDark ? '#fff' : '#000' }]}
        numberOfLines={1}
      >
        {monthYearLabel}
      </Text>
      <View style={styles.container}>
        <ThemedPressable
          onPress={handlePreviousWeek}
          style={styles.navButton}
          hitSlop={12}
          accessibilityLabel="Semana anterior"
        >
          <IconSymbol name="chevron.left" size={16} color={arrowColor} />
        </ThemedPressable>

        <View style={styles.stripChannel} pointerEvents="box-none">
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.weekStripWrap, animatedStripStyle]}>
              <View style={styles.weekStrip}>
                {weekDays.map(({ date, label, ymd }) => {
                  const isSelected = selectedYmd === ymd
                  const isToday = ymd === format(new Date(), 'yyyy-MM-dd')
                  const hasCompleted = completedForDay(ymd)
                  const hasInProgress = inProgressForDay(ymd)
                  const isoWeekday = getISODay(date)
                  const hasScheduled = hasScheduledWorkout(isoWeekday)
                  const hasClass = hasClassOnDay(ymd)
                  const hasWorkoutOrClass = hasScheduled || hasClass

                  // Determine circle color: green if completed, blue if in progress, orange if workout or class that day
                  let circleColor: string | null = null
                  if (hasCompleted) {
                    circleColor = '#22c55e' // green
                  } else if (hasInProgress) {
                    circleColor = '#2563eb' // blue
                  } else if (hasWorkoutOrClass) {
                    circleColor = '#f97316' // orange
                  }

                  // Background: white for dark mode selected, black for light mode selected, light gray for today, transparent otherwise
                  let backgroundColor = 'transparent'
                  if (isSelected) {
                    backgroundColor = isDark ? '#fff' : '#000'
                  } else if (isToday) {
                    backgroundColor = isDark
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.05)'
                  }

                  // Text color: black for selected in dark mode, white for selected in light mode, white for unselected in dark mode, black for unselected in light mode
                  const textColor = isSelected
                    ? isDark
                      ? '#000'
                      : '#fff'
                    : isDark
                      ? '#fff'
                      : '#000'

                  return (
                    <ThemedPressable
                      key={ymd}
                      style={[
                        styles.dayCell,
                        {
                          backgroundColor,
                          borderColor: 'transparent',
                          borderWidth: 2, // Always 2px border for consistent sizing
                        },
                      ]}
                      onPress={() => onDateSelect(date)}
                    >
                      <View style={styles.dayCellContent}>
                        <Text
                          style={[
                            styles.dayCellLabel,
                            textColor ? { color: textColor } : undefined,
                          ]}
                        >
                          {label}
                        </Text>
                        <Text
                          style={[
                            styles.dayCellNum,
                            textColor ? { color: textColor } : undefined,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        {circleColor && (
                          <View
                            style={[
                              styles.statusCircle,
                              { backgroundColor: circleColor },
                            ]}
                          />
                        )}
                      </View>
                    </ThemedPressable>
                  )
                })}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>

        <ThemedPressable
          onPress={handleNextWeek}
          style={styles.navButton}
          hitSlop={12}
          accessibilityLabel="Semana siguiente"
        >
          <IconSymbol name="chevron.right" size={16} color={arrowColor} />
        </ThemedPressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  navButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  stripChannel: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    minHeight: 56,
  },
  weekStripWrap: {
    alignSelf: 'center',
    flexDirection: 'row',
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.select({ android: 4, default: 8 }),
  },
  dayCell: {
    width: Platform.select({ android: 36, default: 38 }),
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dayCellContent: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  dayCellLabel: {
    fontSize: 11,
    opacity: 0.9,
    lineHeight: 13,
    // Android font metrics include larger ascenders — removing the fixed height
    // prevents tall glyphs like 'l' and 'j' from being clipped at the top
    height: Platform.select({ android: undefined, default: 13 }),
  },
  dayCellNum: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    height: 20,
    marginTop: 2,
  },
  statusCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
})
