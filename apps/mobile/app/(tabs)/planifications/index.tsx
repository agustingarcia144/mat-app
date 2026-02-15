import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUser } from '@clerk/clerk-expo'
import type { Href } from 'expo-router'
import { useRouter } from 'expo-router'
import { useQuery, Authenticated, AuthLoading } from 'convex/react'
import { api } from '@repo/convex'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { ThemedPressable } from '@/components/ui/themed-pressable'
import LoadingScreen from '@/components/shared/screens/loading-screen'

function PlanificationsContent() {
  const { user } = useUser()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : 'skip'
  )

  if (assignments === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  const activeAssignments = assignments.filter((a) => a.status === 'active')
  const otherAssignments = assignments.filter((a) => a.status !== 'active')

  const renderItem = ({ item }: { item: (typeof assignments)[number] }) => {
    const name = item.planification?.name ?? 'Planificación'
    const weeksCount =
      'weeksCount' in item ? (item as { weeksCount: number }).weeksCount : 0
    const startDate = item.startDate
      ? format(new Date(item.startDate), 'd MMM yyyy', { locale: es })
      : null
    const endDate = item.endDate
      ? format(new Date(item.endDate), 'd MMM yyyy', { locale: es })
      : null
    const dateRange =
      startDate && endDate
        ? `${startDate} – ${endDate}`
        : startDate
          ? `Desde ${startDate}`
          : endDate
            ? `Hasta ${endDate}`
            : null
    const mutedColor = isDark ? '#a1a1aa' : '#71717a'

    return (
      <ThemedPressable
        type="secondary"
        lightColor="#f4f4f5"
        darkColor="#27272a"
        style={[styles.card, { borderColor: isDark ? '#3f3f46' : '#e4e4e7' }]}
        onPress={() => router.push(`/planifications/${item._id}` as Href)}
      >
        <ThemedText style={styles.cardTitle}>{name}</ThemedText>
        <View style={styles.cardMeta}>
          <Text style={[styles.cardMetaText, { color: mutedColor }]}>
            {weeksCount === 1 ? '1 semana' : `${weeksCount} semanas`}
          </Text>
          {dateRange ? (
            <Text style={[styles.cardMetaText, { color: mutedColor }]}>
              {dateRange}
            </Text>
          ) : null}
        </View>
      </ThemedPressable>
    )
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Planificaciones
        </ThemedText>
        <ThemedText style={styles.subtitle}>Tus rutinas asignadas</ThemedText>

        {assignments.length === 0 ? (
          <View style={[styles.empty, styles.centered]}>
            <ThemedText style={styles.emptyText}>
              No tienes planificaciones asignadas
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Contacta a tu entrenador para que te asigne una rutina
            </ThemedText>
          </View>
        ) : (
          <>
            {activeAssignments.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Activas</ThemedText>
                {activeAssignments.map((item) => (
                  <View key={item._id}>{renderItem({ item })}</View>
                ))}
              </View>
            )}
            {otherAssignments.length > 0 && (
              <View style={styles.section}>
                <ThemedText style={styles.sectionTitle}>Otras</ThemedText>
                {otherAssignments.map((item) => (
                  <View key={item._id}>{renderItem({ item })}</View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  )
}

export default function PlanificationsScreen() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <PlanificationsContent />
      </Authenticated>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.8,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    marginBottom: 12,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardMeta: {
    marginTop: 8,
    gap: 4,
  },
  cardMetaText: {
    fontSize: 13,
  },
  empty: {
    flex: 1,
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
    textAlign: 'center',
  },
})
