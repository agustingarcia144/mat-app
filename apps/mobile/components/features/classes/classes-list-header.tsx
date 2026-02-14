import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ThemedText } from '@/components/themed-text'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ClassIcon } from './class-icon'

export interface NextUpcomingItem {
  type: 'reservation' | 'schedule'
  schedule: {
    startTime: number
    endTime: number
    currentReservations?: number
    capacity?: number
  }
  class: { name: string }
}

interface ClassesListHeaderProps {
  insetsTop: number
  error: string
  isDark: boolean
  nextUpcoming: NextUpcomingItem | null
}

export function ClassesListHeader({
  insetsTop,
  error,
  isDark,
  nextUpcoming,
}: ClassesListHeaderProps) {
  return (
    <View
      style={[
        styles.listHeaderContent,
        {
          paddingTop: insetsTop + 24,
          paddingBottom: 16,
        },
      ]}
    >
      <ThemedText type="title" style={styles.title}>
        Clases
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        Reservá tu lugar en las próximas clases
      </ThemedText>

      {error ? (
        <View
          style={[
            styles.errorBox,
            { backgroundColor: isDark ? '#3f1d2a' : '#ffe4e6' },
          ]}
        >
          <Text
            style={[
              styles.errorText,
              { color: isDark ? '#fecdd3' : '#9f1239' },
            ]}
          >
            {error}
          </Text>
        </View>
      ) : null}

      {nextUpcoming?.schedule && nextUpcoming?.class ? (
        <View
          style={[
            styles.highlightCard,
            {
              backgroundColor: isDark ? '#27272a' : '#f4f4f5',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? '#3f3f46' : '#e4e4e7',
            },
          ]}
        >
          <View style={styles.highlightCardInner}>
            <ClassIcon
              className={nextUpcoming.class.name}
              isDark={isDark}
            />
            <View style={styles.highlightCardContent}>
              <Text
                style={[
                  styles.highlightCardLabel,
                  {
                    color: isDark ? '#a1a1aa' : '#71717a',
                  },
                ]}
              >
                {nextUpcoming.type === 'reservation'
                  ? 'Tu próxima reserva'
                  : 'Próxima clase'}{' '}
                ·{' '}
                {format(new Date(nextUpcoming.schedule.startTime), 'd MMM', {
                  locale: es,
                })}
              </Text>
              <Text
                style={[
                  styles.highlightCardTitle,
                  { color: isDark ? '#fafafa' : '#18181b' },
                ]}
              >
                {nextUpcoming.class.name}
              </Text>
              <Text
                style={[
                  styles.highlightCardMeta,
                  {
                    color: isDark ? '#a1a1aa' : '#71717a',
                  },
                ]}
              >
                {format(new Date(nextUpcoming.schedule.startTime), 'HH:mm', {
                  locale: es,
                })}
                –
                {format(new Date(nextUpcoming.schedule.endTime), 'HH:mm', {
                  locale: es,
                })}
                {nextUpcoming.type === 'reservation'
                  ? ' · Reservado'
                  : nextUpcoming.schedule.currentReservations != null && nextUpcoming.schedule.capacity != null
                    ? ` · ${nextUpcoming.schedule.currentReservations}/${nextUpcoming.schedule.capacity}`
                    : ''}
              </Text>
            </View>
            <IconSymbol
              name="chevron.right"
              size={20}
              color={isDark ? '#a1a1aa' : '#71717a'}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  listHeaderContent: {
    paddingHorizontal: 12,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.8,
    marginBottom: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
  },
  highlightCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  highlightCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  highlightCardContent: {
    flex: 1,
  },
  highlightCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  highlightCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  highlightCardMeta: {
    fontSize: 13,
  },
})
