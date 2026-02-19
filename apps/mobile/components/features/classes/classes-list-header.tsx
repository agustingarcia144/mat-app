import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ThemedText } from '@/components/ui/themed-text'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ClassIcon } from './class-icon'
import { ClassesEmptyStateCard } from './classes-empty-state-card'

export interface NextUpcomingItem {
  type: 'reservation' | 'schedule'
  schedule: {
    _id: string
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
  /** Navigate to class details; same as list row card tap. */
  onPressCard?: (scheduleId: string) => void
  showCard?: boolean
}

export function ClassesListHeader({
  insetsTop,
  error,
  isDark,
  nextUpcoming,
  showCard = true,
  onPressCard,
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
      <ThemedText
        type="title"
        style={[styles.title, !isDark && styles.titleLight]}
        {...(!isDark && { lightColor: '#18181b' })}
      >
        Clases
      </ThemedText>
      <ThemedText
        style={[styles.subtitle, !isDark && styles.subtitleLight]}
        {...(!isDark && { lightColor: '#52525b' })}
      >
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

      {showCard &&
        (nextUpcoming?.type === 'reservation' &&
        nextUpcoming?.schedule &&
        nextUpcoming?.class ? (
          <Pressable
            style={({ pressed }) => [
              styles.highlightCard,
              {
                backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : '#ffedd5',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: isDark ? 'rgba(234,88,12,0.35)' : '#fed7aa',
              },
              pressed && styles.highlightCardPressed,
            ]}
            onPress={() => {
              if (nextUpcoming.schedule._id && onPressCard) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                onPressCard(nextUpcoming.schedule._id)
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`Ver detalles de ${nextUpcoming.class.name}`}
          >
            <View style={styles.highlightCardInner}>
              <ClassIcon className={nextUpcoming.class.name} isDark={isDark} />
              <View style={styles.highlightCardContent}>
                <Text
                  style={[
                    styles.highlightCardLabel,
                    {
                      color: isDark ? '#fdba74' : '#c2410c',
                    },
                  ]}
                >
                  Tu próxima reserva ·{' '}
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
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={20}
                color={isDark ? '#fdba74' : '#ea580c'}
              />
            </View>
          </Pressable>
        ) : (
          <ClassesEmptyStateCard />
        ))}
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
  titleLight: {
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.8,
    marginBottom: 20,
  },
  subtitleLight: {
    opacity: 1,
    fontSize: 15,
    lineHeight: 22,
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
  highlightCardPressed: {
    opacity: 0.92,
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
