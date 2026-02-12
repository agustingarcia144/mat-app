import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedButton } from '@/components/themed-button'
import { IconSymbol } from '../../ui/icon-symbol'

/** ISO weekday: 1 = Monday, 7 = Sunday */
function getISOWeekday(d: Date): number {
  const day = d.getDay()
  return day === 0 ? 7 : day
}

function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Get Monday and Sunday of the week containing `date` */
function getWeekRange(date: Date): { monday: Date; sunday: Date } {
  const d = new Date(date)
  const iso = getISOWeekday(d)
  const monday = new Date(d)
  monday.setDate(d.getDate() - (iso - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { monday, sunday }
}

const SHORT_DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
        ymd: formatYYYYMMDD(curr),
      })
      curr.setDate(curr.getDate() + 1)
    }
    return days
  }, [monday])

  const selectedYmd = formatYYYYMMDD(selectedDate)

  const completedForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === 'completed'
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

  return (
    <View style={styles.container}>
      <ThemedButton
        onPress={handlePreviousWeek}
        style={styles.navButton}
        hitSlop={12}
        accessibilityLabel="Semana anterior"
      >
        <IconSymbol name="chevron.left" size={20} color={arrowColor} />
      </ThemedButton>

      <View style={styles.weekStrip}>
        {weekDays.map(({ date, label, ymd }) => {
          const isSelected = selectedYmd === ymd
          const isToday = ymd === formatYYYYMMDD(new Date())
          const hasCompleted = completedForDay(ymd)
          const isoWeekday = getISOWeekday(date)
          const hasScheduled = hasScheduledWorkout(isoWeekday)

          // Determine circle color: green if completed, orange if scheduled, null otherwise
          let circleColor: string | null = null
          if (hasCompleted) {
            circleColor = '#22c55e' // green
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
            <ThemedButton
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
              activeOpacity={0.7}
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
            </ThemedButton>
          )
        })}
      </View>

      <ThemedButton
        onPress={handleNextWeek}
        style={styles.navButton}
        hitSlop={12}
        accessibilityLabel="Semana siguiente"
      >
        <IconSymbol name="chevron.right" size={20} color={arrowColor} />
      </ThemedButton>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
