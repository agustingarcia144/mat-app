import React, { useMemo, useEffect, useCallback, useState } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  Dimensions,
  Text,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { getYoutubeVideoId, getVideoThumbnailUrl } from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import ParallaxScrollView from '@/components/ui/parallax-scroll-view'
import { useExerciseVideo } from '@/contexts/exercise-video-context'
import { BarChart } from 'react-native-gifted-charts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const HEADER_BG = { light: '#e5e5e5', dark: '#262626' }
const CHART_WIDTH = Dimensions.get('window').width - 48 - 36 // card padding - y-axis area

type Metric = 'weight' | 'reps' | 'time'

function parseNums(raw: string | undefined): number[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => {
      const t = s.trim()
      if (t === '-' || t === '') return 0
      const n = parseFloat(t)
      return isNaN(n) ? 0 : n
    })
}

function hasPositive(nums: number[]): boolean {
  return nums.some((n) => n > 0)
}

function buildBars(
  entries: { performedOn: string; reps?: string; weight?: string; timeSeconds?: string }[],
  metric: Metric,
  barColor: string,
  labelColor: string,
  valueColor: string,
) {
  // Step 1: one representative value per session (max of positive set values)
  const sessionValues: { performedOn: string; value: number }[] = []
  for (const entry of entries) {
    const nums =
      metric === 'weight'
        ? parseNums(entry.weight)
        : metric === 'reps'
          ? parseNums(entry.reps)
          : parseNums(entry.timeSeconds)
    const positives = nums.filter((n) => n > 0)
    if (positives.length === 0) continue
    sessionValues.push({
      performedOn: entry.performedOn,
      value: Math.max(...positives),
    })
  }

  if (sessionValues.length === 0) return []

  // Step 2: run-length encode — collapse consecutive sessions with the same value
  const groups: { value: number; firstDate: string }[] = []
  for (const sv of sessionValues) {
    const last = groups[groups.length - 1]
    if (last && last.value === sv.value) continue // same streak, skip
    groups.push({ value: sv.value, firstDate: sv.performedOn })
  }

  // Step 3: one bar per group
  return groups.map(({ value: val, firstDate }) => ({
    value: val,
    frontColor: barColor,
    label: format(parseISO(firstDate), 'd MMM', { locale: es }),
    labelWidth: 44,
    labelTextStyle: { fontSize: 9, color: labelColor },
    barWidth: 32,
    spacing: 20,
    topLabelComponentHeight: 0,
    topLabelComponent: () => (
      <Text style={{ fontSize: 11, color: valueColor, fontWeight: '600', marginBottom: 2 }}>
        {val}
      </Text>
    ),
  }))
}

function formatLoad(weight?: string, prPercentage?: number) {
  if (weight?.trim()) return weight.trim()
  if (prPercentage != null && prPercentage > 0) return `${prPercentage}% RM`
  return ''
}

export default function ExerciseDetailContent() {
  const { assignmentId, exerciseId, dayExerciseId } = useLocalSearchParams<{
    assignmentId?: string
    exerciseId: string
    dayExerciseId?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [activeMetric, setActiveMetric] = useState<Metric>('weight')

  const exercise = useQuery(
    api.exercises.getById,
    exerciseId ? { id: exerciseId as any } : 'skip'
  )
  const dayExercise = useQuery(
    api.dayExercises.getById,
    dayExerciseId ? { id: dayExerciseId as any } : 'skip'
  )
  const progress = useQuery(
    api.sessionExerciseLogs.getProgressByExercise,
    exerciseId ? { exerciseId: exerciseId as any } : 'skip'
  )

  const youtubeVideoId = useMemo(() => {
    if (!exercise?.videoUrl) return null
    return getYoutubeVideoId(exercise.videoUrl)
  }, [exercise?.videoUrl])

  const thumbnailUrl = useMemo(() => {
    if (!exercise?.videoUrl) return null
    return getVideoThumbnailUrl(exercise.videoUrl)
  }, [exercise?.videoUrl])

  // Always use embed when we have a YouTube URL. Constants.isDevice can be false on some
  // physical devices/builds, so we don't gate on simulator to avoid showing thumbnail on device.
  const useEmbed = !!youtubeVideoId

  const { setVideoControls } = useExerciseVideo()

  const openVideo = useCallback(() => {
    if (exercise?.videoUrl) Linking.openURL(exercise.videoUrl)
  }, [exercise?.videoUrl])

  const openVideoSheet = useCallback(() => {
    if (!youtubeVideoId) {
      openVideo()
      return
    }

    if (assignmentId) {
      router.push({
        pathname: '/(tabs)/planifications/[assignmentId]/[exerciseId]/video',
        params: {
          assignmentId,
          exerciseId,
          ...(dayExerciseId ? { dayExerciseId } : {}),
        },
      })
      return
    }

    router.push({
      pathname: '/(tabs)/home/exercise/video/[exerciseId]',
      params: {
        exerciseId,
        ...(dayExerciseId ? { dayExerciseId } : {}),
      },
    })
  }, [
    assignmentId,
    dayExerciseId,
    exerciseId,
    openVideo,
    router,
    youtubeVideoId,
  ])

  useEffect(() => {
    if (useEmbed) {
      setVideoControls(openVideoSheet, false)
    }
    return () => setVideoControls(null, true)
  }, [useEmbed, openVideoSheet, setVideoControls])

  const summaryParts = useMemo(() => {
    const parts: string[] = []
    if (dayExercise) {
      parts.push(`${dayExercise.sets} series`)
      parts.push(`${dayExercise.reps} rep`)
      const loadLabel = formatLoad(dayExercise.weight, dayExercise.prPercentage)
      if (loadLabel) parts.push(loadLabel)
    }
    return parts
  }, [dayExercise])

  const hasVideo = !!exercise?.videoUrl
  const stickyFooterHeight = hasVideo ? 80 + insets.bottom : 0

  if (exercise === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </ThemedView>
    )
  }

  if (!exercise) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ThemedText style={styles.notFound}>Ejercicio no encontrado</ThemedText>
        <ThemedText style={styles.backLink} onPress={() => router.back()}>
          Volver
        </ThemedText>
      </ThemedView>
    )
  }

  const hasDescription = !!exercise.description?.trim()
  const hasDayNotes = !!dayExerciseId && !!dayExercise?.notes?.trim()

  const headerImage = thumbnailUrl ? (
    <Pressable style={styles.headerImageWrap} onPress={openVideoSheet}>
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.headerImage}
        resizeMode="cover"
      />
    </Pressable>
  ) : (
    <View
      style={[
        styles.headerImageWrap,
        styles.headerPlaceholder,
        { backgroundColor: HEADER_BG[colorScheme ?? 'light'] },
      ]}
    >
      <Image
        source={require('@/assets/images/mat-wolf-looking.png')}
        style={styles.headerPlaceholderImage}
        resizeMode="contain"
        accessibilityLabel="Sin video"
      />
      <ThemedText style={styles.headerPlaceholderText}>
        Ejercicio sin video disponible
      </ThemedText>
    </View>
  )

  return (
    <ThemedView style={styles.container}>
      <ParallaxScrollView
        headerImage={headerImage}
        headerBackgroundColor={HEADER_BG}
        contentBottomPadding={stickyFooterHeight + 24}
      >
        {/* Title block */}
        <ThemedText style={styles.title}>{exercise.name}</ThemedText>
        {(exercise.category || summaryParts.length > 0) && (
          <ThemedText style={styles.subtitle}>
            {exercise.category
              ? summaryParts.length > 0
                ? `${exercise.category} · ${summaryParts.join(' · ')}`
                : exercise.category
              : summaryParts.join(' · ')}
          </ThemedText>
        )}

        {hasDescription && (
          <View style={styles.sectionFirst}>
            <ThemedText style={styles.sectionLabel}>Descripción</ThemedText>
            <ThemedText style={styles.body}>{exercise.description}</ThemedText>
          </View>
        )}

        {hasDayNotes && (
          <View
            style={[
              styles.section,
              {
                borderTopColor: isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.08)',
              },
            ]}
          >
            <ThemedText style={styles.sectionLabel}>
              Notas del entrenamiento
            </ThemedText>
            <ThemedText style={styles.body}>{dayExercise!.notes}</ThemedText>
          </View>
        )}

        {progress != null && progress.length > 0 && (() => {
          const barColor = isDark ? '#60a5fa' : '#3b82f6'
          const labelColor = isDark ? '#71717a' : '#71717a'
          const valueColor = isDark ? '#e4e4e7' : '#18181b'
          const ruleColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
          const axisColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
          const textColor = isDark ? '#a1a1aa' : '#71717a'

          const hasWeight = progress.some((e) => hasPositive(parseNums(e.weight)))
          const hasReps = progress.some((e) => hasPositive(parseNums(e.reps)))
          const hasTime = progress.some((e) => hasPositive(parseNums(e.timeSeconds)))

          const availableMetrics: { key: Metric; label: string }[] = []
          if (hasWeight) availableMetrics.push({ key: 'weight', label: 'Peso' })
          if (hasReps) availableMetrics.push({ key: 'reps', label: 'Reps' })
          if (hasTime) availableMetrics.push({ key: 'time', label: 'Tiempo' })

          if (availableMetrics.length === 0) return null

          const metric = availableMetrics.some((m) => m.key === activeMetric)
            ? activeMetric
            : availableMetrics[0].key

          const unitLabel = metric === 'weight' ? 'kg' : metric === 'reps' ? 'rep' : 's'
          const bars = buildBars(progress, metric, barColor, labelColor, valueColor)
          const dataMax = bars.reduce((m, b) => Math.max(m, b.value), 0)
          // Round up to a clean multiple so Y-axis labels are integers
          const step = dataMax <= 10 ? 2 : dataMax <= 30 ? 5 : dataMax <= 100 ? 10 : 20
          const maxValue = Math.ceil((dataMax * 1.25) / step) * step
          const noOfSections = maxValue / step

          return (
            <View
              style={[
                styles.section,
                { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' },
              ]}
            >
              <ThemedText style={styles.sectionLabel}>
                Progreso{unitLabel ? ` (${unitLabel})` : ''}
              </ThemedText>

              {availableMetrics.length > 1 && (
                <View style={styles.metricTabs}>
                  {availableMetrics.map(({ key, label }) => (
                    <Pressable
                      key={key}
                      onPress={() => setActiveMetric(key)}
                      style={[
                        styles.metricTab,
                        metric === key && {
                          backgroundColor: isDark ? '#3b82f6' : '#3b82f6',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.metricTabText,
                          { color: metric === key ? '#fff' : textColor },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.chartWrap}>
                <BarChart
                  data={bars}
                  width={CHART_WIDTH}
                  height={150}
                  initialSpacing={8}
                  maxValue={maxValue}
                  noOfSections={noOfSections}
                  stepValue={step}
                  yAxisLabelWidth={36}
                  yAxisTextStyle={{ color: textColor, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: labelColor, fontSize: 9 }}
                  rulesColor={ruleColor}
                  yAxisColor={axisColor}
                  xAxisColor={axisColor}
                  hideRules={false}
                  isAnimated
                  animationDuration={400}
                  barBorderRadius={3}
                />
              </View>
            </View>
          )
        })()}
      </ParallaxScrollView>
    </ThemedView>
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
  headerImageWrap: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  headerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  headerPlaceholderImage: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  headerPlaceholderText: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.85,
    paddingHorizontal: 16,
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    marginBottom: 20,
  },
  sectionFirst: {
    marginTop: 24,
  },
  section: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.7,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.9,
  },
  notFound: {
    fontSize: 16,
    marginBottom: 12,
  },
  backLink: {
    fontSize: 16,
    opacity: 0.8,
    textDecorationLine: 'underline',
  },
  metricTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  metricTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chartWrap: {
    marginLeft: -6,
  },
})
