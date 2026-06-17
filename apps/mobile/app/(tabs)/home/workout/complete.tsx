import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Dimensions,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import ConfettiCannon from 'react-native-confetti-cannon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { RatingSlider } from '@/components/features/workout/rating-slider'
import { FinishButton } from '@/components/features/workout/finish-button'
import { ratingColor } from '@/components/features/workout/rating-slider.types'

const MOODS = [
  { value: 'exhausted', emoji: '🥵', label: 'Agotado' },
  { value: 'tired', emoji: '😮‍💨', label: 'Cansado' },
  { value: 'ok', emoji: '😐', label: 'Normal' },
  { value: 'good', emoji: '🙂', label: 'Bien' },
  { value: 'great', emoji: '🤩', label: 'Genial' },
] as const

type MoodValue = (typeof MOODS)[number]['value']

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) return '—'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export default function WorkoutCompleteScreen() {
  const params = useLocalSearchParams<{
    sessionId: string
    exercises?: string
    sets?: string
    volume?: string
    durationSeconds?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const stats = useQuery(api.workoutDaySessions.getMyCompletionStats, {})
  const rateSession = useMutation(api.workoutDaySessions.rateSession)

  const [effort, setEffort] = useState<number | null>(null)
  const [mood, setMood] = useState<MoodValue | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const confettiOrigin = useRef({ x: Dimensions.get('window').width / 2, y: -20 })

  // exercises / sets / volume are still passed through and persisted server-side
  // (via the per-exercise logs); only duration is surfaced here, in the streak row.
  const durationSeconds = Number(params.durationSeconds ?? 0)

  const cardBg = isDark ? '#18181b' : '#f4f4f5'
  const borderColor = isDark ? '#27272a' : '#e4e4e7'
  const mutedColor = isDark ? '#a1a1aa' : '#71717a'
  const inputBg = isDark ? '#27272a' : '#fff'
  const inputColor = isDark ? '#fafafa' : '#18181b'

  const effortColor = ratingColor(effort != null ? 1 - (effort - 1) / 9 : 0.5)

  const moodIndex = mood ? MOODS.findIndex((m) => m.value === mood) : -1
  const selectedMood = moodIndex >= 0 ? MOODS[moodIndex] : null
  const moodColor = ratingColor(
    moodIndex >= 0 ? 1 - moodIndex / (MOODS.length - 1) : 0.5,
  )

  const goHome = () => {
    router.replace('/(tabs)/home')
  }

  const handleFinish = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      if (params.sessionId) {
        await rateSession({
          id: params.sessionId as any,
          effortRating: effort ?? undefined,
          mood: mood ?? undefined,
          memberNote: note.trim() ? note.trim() : undefined,
        })
      }
      goHome()
    } catch (e) {
      console.error(e)
      goHome()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.trophy}>🏆</Text>
          <ThemedText type="title" style={styles.title}>
            ¡Entrenamiento completado!
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
            Buen trabajo. Contanos cómo te fue.
          </ThemedText>
        </View>

        <View style={styles.badgeRow}>
          {stats && stats.currentStreak > 0 && (
            <View
              style={[styles.badge, { backgroundColor: cardBg, borderColor }]}
            >
              <Text style={styles.badgeEmoji}>🔥</Text>
              <ThemedText style={styles.badgeText}>
                {stats.currentStreak}{' '}
                {stats.currentStreak === 1 ? 'día' : 'días'} de racha
              </ThemedText>
            </View>
          )}
          {stats && stats.totalCompleted > 0 && (
            <View
              style={[styles.badge, { backgroundColor: cardBg, borderColor }]}
            >
              <Text style={styles.badgeEmoji}>✅</Text>
              <ThemedText style={styles.badgeText}>
                {stats.totalCompleted} en total
              </ThemedText>
            </View>
          )}
          {durationSeconds > 0 && (
            <View
              style={[styles.badge, { backgroundColor: cardBg, borderColor }]}
            >
              <MaterialIcons
                name="schedule"
                size={16}
                color={mutedColor}
              />
              <ThemedText style={styles.badgeText}>
                {formatDuration(durationSeconds)}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.ratingHeader}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              ¿Qué tan duro fue?
            </ThemedText>
            <ThemedText style={[styles.ratingValue, { color: effortColor }]}>
              {effort ?? '–'}
              <ThemedText style={[styles.ratingMax, { color: mutedColor }]}>
                /10
              </ThemedText>
            </ThemedText>
          </View>
          <RatingSlider
            value={effort}
            min={1}
            max={10}
            color={effortColor}
            onChange={setEffort}
            isDark={isDark}
          />
          <View style={styles.ratingScale}>
            <ThemedText style={[styles.ratingScaleLabel, { color: mutedColor }]}>
              Suave
            </ThemedText>
            <ThemedText style={[styles.ratingScaleLabel, { color: mutedColor }]}>
              Máximo
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.ratingHeader}>
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              ¿Cómo te sentiste?
            </ThemedText>
            <View style={styles.moodCurrent}>
              <Text style={styles.moodCurrentEmoji}>
                {selectedMood?.emoji ?? '🙂'}
              </Text>
              <ThemedText style={[styles.moodCurrentLabel, { color: moodColor }]}>
                {selectedMood?.label ?? '–'}
              </ThemedText>
            </View>
          </View>
          <RatingSlider
            value={selectedMood ? moodIndex + 1 : null}
            min={1}
            max={MOODS.length}
            color={moodColor}
            onChange={(next) => setMood(MOODS[next - 1].value)}
            isDark={isDark}
          />
          <View style={styles.ratingScale}>
            <ThemedText style={[styles.ratingScaleLabel, { color: mutedColor }]}>
              {MOODS[0].label}
            </ThemedText>
            <ThemedText style={[styles.ratingScaleLabel, { color: mutedColor }]}>
              {MOODS[MOODS.length - 1].label}
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Nota para tu entrenador (opcional)
          </ThemedText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="¿Algo que quieras comentar?"
            placeholderTextColor={mutedColor}
            multiline
            style={[
              styles.noteInput,
              { backgroundColor: inputBg, color: inputColor, borderColor },
            ]}
          />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: isDark ? '#0a0a0a' : '#fff',
            borderTopColor: borderColor,
          },
        ]}
      >
        <FinishButton
          label="Finalizar"
          loadingLabel="Guardando…"
          onPress={handleFinish}
          loading={submitting}
          disabled={submitting}
          isDark={isDark}
        />
      </View>

      <ConfettiCannon
        count={160}
        origin={confettiOrigin.current}
        fadeOut
        autoStart
        explosionSpeed={350}
        fallSpeed={2800}
      />
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  header: {
    alignItems: 'center',
    gap: 6,
  },
  trophy: {
    fontSize: 56,
    marginBottom: 4,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  ratingValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  ratingMax: {
    fontSize: 16,
    fontWeight: '600',
  },
  ratingScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingScaleLabel: {
    fontSize: 12,
  },
  moodCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moodCurrentEmoji: {
    fontSize: 22,
  },
  moodCurrentLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  noteInput: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
})
