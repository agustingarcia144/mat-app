import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { addDays, endOfWeek, format, getISODay, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedPressable } from '@/components/themed-pressable'
import { IconSymbol } from '../../ui/icon-symbol'

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
}

export function CalendarWeekView({
  selectedDate,
  onDateSelect,
  onWeekChange,
  weekSessions,
  workoutDays,
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

  const completedForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === 'completed'
    ) ?? false

  const inProgressForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === 'started'
    ) ?? false

  const hasScheduledWorkout = (isoWeekday: number) =>
    workoutDays?.some(
      (d) => d.dayOfWeek !== undefined && d.dayOfWeek === isoWeekday
    ) ?? false

  const handlePreviousWeek = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 7)
    onWeekChange(newDate)
  }

  const handleNextWeek = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 7)
    onWeekChange(newDate)
  }

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
          <IconSymbol name="chevron.left" size={20} color={arrowColor} />
        </ThemedPressable>

        <View style={styles.weekStrip}>
          {weekDays.map(({ date, label, ymd }) => {
            const isSelected = selectedYmd === ymd
            const isToday = ymd === format(new Date(), 'yyyy-MM-dd')
            const hasCompleted = completedForDay(ymd)
            const hasInProgress = inProgressForDay(ymd)
            const isoWeekday = getISODay(date)
            const hasScheduled = hasScheduledWorkout(isoWeekday)

            // Determine circle color: green if completed, orange if scheduled, null otherwise
            let circleColor: string | null = null
            if (hasCompleted) {
              circleColor = '#22c55e' // green
            } else if (hasInProgress) {
              circleColor = '#2563eb' // blue
            } else if (hasScheduled) {
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

        <ThemedPressable
          onPress={handleNextWeek}
          style={styles.navButton}
          hitSlop={12}
          accessibilityLabel="Semana siguiente"
        >
          <IconSymbol name="chevron.right" size={20} color={arrowColor} />
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
    paddingHorizontal: 4,
    width: '100%',
  },
  navButton: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  weekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 0,
  },
  dayCell: {
    width: 40,
    height: 60,
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
    height: 13,
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
