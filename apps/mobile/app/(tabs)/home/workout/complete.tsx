import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Dimensions,
  Animated,
  useWindowDimensions,
} from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import ConfettiCannon from 'react-native-confetti-cannon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@repo/convex'
import { PressableScale } from 'pressto'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { RatingSlider } from '@/components/features/workout/rating-slider'
import { FinishButton } from '@/components/features/workout/finish-button'
import { ratingColor } from '@/components/features/workout/rating-slider.types'
import { IconSymbol } from '@/components/ui/icon-symbol'

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

function formatVolume(volume: number) {
  if (volume <= 0) return '—'
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}t`
  return `${volume}kg`
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
  const { width: screenWidth } = useWindowDimensions()

  const stats = useQuery(api.workoutDaySessions.getMyCompletionStats, {})
  const rateSession = useMutation(api.workoutDaySessions.rateSession)

  const [step, setStep] = useState<0 | 1>(0)
  const [effort, setEffort] = useState<number | null>(null)
  const [mood, setMood] = useState<MoodValue | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const confettiOrigin = useRef({ x: Dimensions.get('window').width / 2, y: -20 })
  const slideX = useRef(new Animated.Value(0)).current

  const exercises = Number(params.exercises ?? 0)
  const sets = Number(params.sets ?? 0)
  const volume = Number(params.volume ?? 0)
  const durationSeconds = Number(params.durationSeconds ?? 0)

  const cardBg = isDark ? '#18181b' : '#f4f4f5'
  const borderColor = isDark ? '#27272a' : '#e4e4e7'
  const mutedColor = isDark ? '#a1a1aa' : '#71717a'
  const inputBg = isDark ? '#27272a' : '#fff'
  const inputColor = isDark ? '#fafafa' : '#18181b'
  const accentColor = isDark ? '#fafafa' : '#18181b'

  const effortColor = ratingColor(effort != null ? 1 - (effort - 1) / 9 : 0.5)

  const moodIndex = mood ? MOODS.findIndex((m) => m.value === mood) : -1
  const selectedMood = moodIndex >= 0 ? MOODS[moodIndex] : null
  const moodColor = ratingColor(
    moodIndex >= 0 ? 1 - moodIndex / (MOODS.length - 1) : 0.5,
  )

  const goHome = () => {
    router.replace('/(tabs)/home')
  }

  const animateToStep = (next: 0 | 1) => {
    setStep(next)
    Animated.spring(slideX, {
      toValue: -next * screenWidth,
      useNativeDriver: true,
      damping: 20,
      stiffness: 160,
      mass: 0.9,
    }).start()
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

  const metrics = [
    {
      key: 'exercises',
      icon: 'fitness-center' as const,
      value: exercises > 0 ? String(exercises) : '—',
      label: exercises === 1 ? 'Ejercicio' : 'Ejercicios',
    },
    {
      key: 'sets',
      icon: 'repeat' as const,
      value: sets > 0 ? String(sets) : '—',
      label: sets === 1 ? 'Serie' : 'Series',
    },
    {
      key: 'volume',
      icon: 'scale' as const,
      value: formatVolume(volume),
      label: 'Volumen',
    },
    {
      key: 'duration',
      icon: 'schedule' as const,
      value: formatDuration(durationSeconds),
      label: 'Tiempo',
    },
  ]

  const renderCongrats = () => (
    <ScrollView
      style={{ width: screenWidth }}
      contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.trophy}>🏆</Text>
        <ThemedText type="title" style={styles.title}>
          ¡Entrenamiento completado!
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Excelente trabajo. Acá está tu resumen.
        </ThemedText>
      </View>

      {stats && (stats.currentStreak > 0 || stats.totalCompleted > 0) && (
        <View style={styles.badgeRow}>
          {stats.currentStreak > 0 && (
            <View style={[styles.badge, { backgroundColor: cardBg, borderColor }]}>
              <Text style={styles.badgeEmoji}>🔥</Text>
              <ThemedText style={styles.badgeText}>
                {stats.currentStreak}{' '}
                {stats.currentStreak === 1 ? 'día' : 'días'} de racha
              </ThemedText>
            </View>
          )}
          {stats.totalCompleted > 0 && (
            <View style={[styles.badge, { backgroundColor: cardBg, borderColor }]}>
              <Text style={styles.badgeEmoji}>✅</Text>
              <ThemedText style={styles.badgeText}>
                {stats.totalCompleted} en total
              </ThemedText>
            </View>
          )}
        </View>
      )}

      <View style={styles.metricsGrid}>
        {metrics.map((metric) => (
          <View
            key={metric.key}
            style={[styles.metricCard, { backgroundColor: cardBg, borderColor }]}
          >
            <MaterialIcons name={metric.icon} size={22} color={mutedColor} />
            <ThemedText style={styles.metricValue}>{metric.value}</ThemedText>
            <ThemedText style={[styles.metricLabel, { color: mutedColor }]}>
              {metric.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </ScrollView>
  )

  const renderFeedback = () => (
    <ScrollView
      style={{ width: screenWidth }}
      contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.feedbackHeader}>
        <ThemedText type="title" style={styles.feedbackTitle}>
          ¿Cómo te fue?
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: mutedColor }]}>
          Contanos para ajustar tu próximo entrenamiento.
        </ThemedText>
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
  )

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.progress, { paddingTop: insets.top + 12 }]}>
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[
              styles.progressSegment,
              {
                flex: index === step ? 2.2 : 1,
                backgroundColor: index <= step ? accentColor : borderColor,
              },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.pager,
          { width: screenWidth * 2, transform: [{ translateX: slideX }] },
        ]}
      >
        {renderCongrats()}
        {renderFeedback()}
      </Animated.View>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom - 48, 8),
            backgroundColor: isDark ? '#0a0a0a' : '#fff',
          },
        ]}
      >
        {step === 0 ? (
          <FinishButton
            label="Continuar"
            onPress={() => animateToStep(1)}
            loading={false}
            disabled={false}
            isDark={isDark}
          />
        ) : (
          <View style={styles.footerRow}>
            <PressableScale
              onPress={() => animateToStep(0)}
              style={[styles.footerBack, { backgroundColor: cardBg, borderColor }]}
              hitSlop={8}
            >
              <IconSymbol name="chevron.left" size={24} color={accentColor} />
            </PressableScale>
            <View style={styles.footerFinish}>
              <FinishButton
                label="Finalizar"
                loadingLabel="Guardando…"
                onPress={handleFinish}
                loading={submitting}
                disabled={submitting}
                isDark={isDark}
              />
            </View>
          </View>
        )}
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
  pager: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 24,
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  progressSegment: {
    height: 4,
    borderRadius: 999,
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
    textAlign: 'left',
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '47.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  feedbackHeader: {
    gap: 6,
  },
  feedbackTitle: {
    textAlign: 'left',
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
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerBack: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerFinish: {
    flex: 1,
  },
})
