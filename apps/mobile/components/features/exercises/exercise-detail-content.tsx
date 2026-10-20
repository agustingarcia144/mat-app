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
  Platform,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { getYoutubeVideoId, getVideoThumbnailUrl } from '@repo/core/utils'
import { LinearGradient } from 'expo-linear-gradient'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useThemeColor } from '@/hooks/use-theme-color'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import { useExerciseVideo } from '@/contexts/exercise-video-context'
import { BarChart } from 'react-native-gifted-charts'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const HEADER_BG = { light: '#e5e5e5', dark: '#262626' }
const CHART_WIDTH = Dimensions.get('window').width - 48 - 36 // card padding - y-axis area
const PAGE_SIZE = 10
const CHART_EDGE_SPACING = 8
const BAR_SLOT_WIDTH = (CHART_WIDTH - CHART_EDGE_SPACING * 2) / PAGE_SIZE
const SWIPE_THRESHOLD = 50
const SWIPE_VELOCITY = 400

type Metric = 'weight' | 'reps' | 'time'

function parseNums(raw: string | undefined): number[] {
  if (!raw) return []
  return raw.split(',').map((s) => {
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
  entries: {
    performedOn: string
    reps?: string
    weight?: string
    timeSeconds?: string
  }[],
  metric: Metric,
  barColor: string,
  labelColor: string
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

  // Keep one bar per session, including consecutive equal values.
  return sessionValues.map(({ value, performedOn }) => ({
    value,
    performedOn,
    frontColor: barColor,
    label: format(parseISO(performedOn), 'd MMM', { locale: es }),
    labelWidth: BAR_SLOT_WIDTH,
    labelTextStyle: { fontSize: 9, color: labelColor },
    barWidth: BAR_SLOT_WIDTH * 0.6,
    spacing: BAR_SLOT_WIDTH * 0.4,
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
  const cardBg = useThemeColor({}, 'background')
  const exercise = useQuery(
    api.exercises.getById,
    exerciseId ? { id: exerciseId as any } : 'skip'
  )
  const dayExercise = useQuery(
    api.dayExercises.getById,
    dayExerciseId ? { id: dayExerciseId as any } : 'skip'
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
        pathname: '/profile/planifications/[assignmentId]/[exerciseId]/video',
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

  const subtitleText = exercise.category
    ? summaryParts.length > 0
      ? `${exercise.category} · ${summaryParts.join(' · ')}`
      : exercise.category
    : summaryParts.length > 0
      ? summaryParts.join(' · ')
      : ''
  const hasSubtitle = !!subtitleText

  const headerImage = thumbnailUrl ? (
    <Pressable style={styles.headerImageWrap} onPress={openVideoSheet}>
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.headerImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.55, 1]}
        style={styles.headerGradient}
      />
      <View style={styles.headerTitleOverlay}>
        <Text style={styles.headerTitleOverlayText} numberOfLines={2}>
          {exercise.name}
        </Text>
      </View>
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: stickyFooterHeight + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.header,
            { backgroundColor: HEADER_BG[colorScheme ?? 'light'] },
          ]}
        >
          {headerImage}
        </View>
        <View style={[styles.card, { backgroundColor: cardBg }]}>
        {/* The title is overlaid on the header image when a thumbnail exists;
            without one it falls back to the card. The subtitle stays here. */}
        {!thumbnailUrl && (
          <ThemedText style={styles.title}>{exercise.name}</ThemedText>
        )}
        {hasSubtitle && (
          <ThemedText style={styles.subtitle}>{subtitleText}</ThemedText>
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

        {exerciseId && (
          <ProgressErrorBoundary>
            <ExerciseProgressSection exerciseId={exerciseId} />
          </ProgressErrorBoundary>
        )}
        </View>
      </ScrollView>
    </ThemedView>
  )
}

/**
 * Isolated so a slow or failing progress query (or a chart render error) only
 * hides this section instead of throwing out of the whole exercise screen,
 * which in release builds crashes the app — including while the video sheet
 * is presented on top of it.
 */
class ProgressErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[exercise-progress]', error)
  }

  render() {
    return this.state.hasError ? null : this.props.children
  }
}

function ExerciseProgressSection({ exerciseId }: { exerciseId: string }) {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const [activeMetric, setActiveMetric] = useState<Metric>('weight')
  const [pageIndex, setPageIndex] = useState(0)
  const dragX = useSharedValue(0)
  const progress = useQuery(api.sessionExerciseLogs.getProgressByExercise, {
    exerciseId: exerciseId as any,
  })

  const barColor = isDark ? '#60a5fa' : '#3b82f6'
  const labelColor = '#71717a'
  const valueColor = isDark ? '#e4e4e7' : '#18181b'
  const ruleColor = isDark
    ? 'rgba(255,255,255,0.07)'
    : 'rgba(0,0,0,0.07)'
  const axisColor = isDark
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(0,0,0,0.12)'
  const textColor = isDark ? '#a1a1aa' : '#71717a'

  const hasWeight = progress?.some((e) =>
    hasPositive(parseNums(e.weight))
  )
  const hasReps = progress?.some((e) => hasPositive(parseNums(e.reps)))
  const hasTime = progress?.some((e) =>
    hasPositive(parseNums(e.timeSeconds))
  )

  const availableMetrics: { key: Metric; label: string }[] = []
  if (hasWeight)
    availableMetrics.push({ key: 'weight', label: 'Peso' })
  if (hasReps) availableMetrics.push({ key: 'reps', label: 'Reps' })
  if (hasTime) availableMetrics.push({ key: 'time', label: 'Tiempo' })

  const metric = availableMetrics.some((m) => m.key === activeMetric)
    ? activeMetric
    : (availableMetrics[0]?.key ?? activeMetric)

  const unitLabel =
    metric === 'weight' ? 'kg' : metric === 'reps' ? 'rep' : 's'
  const allBars = useMemo(
    () => buildBars(progress ?? [], metric, barColor, labelColor),
    [progress, metric, barColor, labelColor]
  )
  const totalPages = Math.max(1, Math.ceil(allBars.length / PAGE_SIZE))
  const currentPageIndex = Math.max(0, Math.min(pageIndex, totalPages - 1))
  // Anchor at the newest end, leaving any partial page at the oldest end.
  const end = allBars.length - currentPageIndex * PAGE_SIZE
  const pageBars = allBars.slice(Math.max(0, end - PAGE_SIZE), end)
  const canGoOlder = currentPageIndex < totalPages - 1
  const canGoNewer = currentPageIndex > 0

  useEffect(() => {
    setPageIndex(0)
    cancelAnimation(dragX)
    dragX.value = 0
    return () => cancelAnimation(dragX)
  }, [metric, allBars.length, exerciseId, dragX])

  const goOlder = useCallback(() => {
    dragX.value = 0
    setPageIndex((index) => Math.min(index + 1, totalPages - 1))
  }, [dragX, totalPages])

  const goNewer = useCallback(() => {
    dragX.value = 0
    setPageIndex((index) => Math.max(0, index - 1))
  }, [dragX])

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(totalPages > 1)
        .activeOffsetX([-16, 16])
        .failOffsetY([-16, 16])
        .onUpdate((event) => {
          const atEdge =
            (event.translationX < 0 && !canGoOlder) ||
            (event.translationX > 0 && !canGoNewer)
          dragX.value = event.translationX * (atEdge ? 0.25 : 1)
        })
        .onEnd((event) => {
          const older =
            event.translationX < -SWIPE_THRESHOLD ||
            event.velocityX < -SWIPE_VELOCITY
          const newer =
            event.translationX > SWIPE_THRESHOLD ||
            event.velocityX > SWIPE_VELOCITY
          if (older && canGoOlder) {
            dragX.value = withTiming(
              -CHART_WIDTH,
              { duration: 180 },
              (finished) => {
                if (finished) {
                  scheduleOnRN(goOlder)
                  dragX.value = 0
                }
              }
            )
          } else if (newer && canGoNewer) {
            dragX.value = withTiming(
              CHART_WIDTH,
              { duration: 180 },
              (finished) => {
                if (finished) {
                  scheduleOnRN(goNewer)
                  dragX.value = 0
                }
              }
            )
          } else {
            dragX.value = withTiming(0, { duration: 180 })
          }
        })
        .onFinalize((_event, success) => {
          if (!success) dragX.value = withTiming(0, { duration: 180 })
        }),
    [totalPages, canGoOlder, canGoNewer, dragX, goOlder, goNewer]
  )

  const animatedTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
  }))

  const dataMax = allBars.reduce((m, b) => Math.max(m, b.value), 0)
  // Pick a clean step and round up so the chart top is a nice number
  const step =
    dataMax <= 10 ? 2 : dataMax <= 30 ? 5 : dataMax <= 100 ? 10 : 20
  const maxValue = Math.ceil(dataMax / step) * step + step
  const noOfSections = maxValue / step

  // All hooks above run even while the query is loading or has no values.
  if (progress === undefined) {
    return (
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
        <ThemedText style={styles.sectionLabel}>Progreso</ThemedText>
        <View
          style={[
            styles.progressLoading,
            {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.04)'
                : 'rgba(0,0,0,0.03)',
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando progreso"
        >
          <ActivityIndicator color={isDark ? '#a1a1aa' : '#71717a'} />
          <ThemedText style={styles.progressLoadingText}>
            Cargando progreso…
          </ThemedText>
        </View>
      </View>
    )
  }

  if (allBars.length === 0) return null

  const dateRange = `${pageBars[0].label} – ${pageBars[pageBars.length - 1].label}`

  return (
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
        Progreso{unitLabel ? ` (${unitLabel})` : ''}
      </ThemedText>

      {availableMetrics.length > 1 && (
        <View style={styles.metricTabs}>
          {availableMetrics.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => {
                setPageIndex(0)
                cancelAnimation(dragX)
                dragX.value = 0
                setActiveMetric(key)
              }}
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
        <GestureDetector gesture={panGesture}>
          <Animated.View style={animatedTranslateStyle}>
            {/* Gifted Charts' bar animation retains mount-time heights after data updates. */}
            {Platform.OS === 'ios' ? (
              <BarChart
                data={pageBars}
                width={CHART_WIDTH}
                height={150}
                initialSpacing={CHART_EDGE_SPACING}
                endSpacing={CHART_EDGE_SPACING}
                barWidth={BAR_SLOT_WIDTH * 0.6}
                spacing={BAR_SLOT_WIDTH * 0.4}
                disableScroll
                maxValue={maxValue}
                noOfSections={noOfSections}
                hideYAxisText
                yAxisLabelWidth={0}
                xAxisLabelTextStyle={{ color: labelColor, fontSize: 9 }}
                rulesColor={ruleColor}
                yAxisColor="transparent"
                xAxisColor={axisColor}
                hideRules={false}
                showValuesAsTopLabel
                topLabelTextStyle={{
                  fontSize: 11,
                  color: valueColor,
                  fontWeight: '600',
                }}
                isAnimated={false}
                barBorderRadius={3}
              />
            ) : (
              <View style={styles.androidProgressList}>
                {pageBars.map((bar, i) => (
                  <View key={i} style={styles.androidProgressRow}>
                    <Text
                      style={[
                        styles.androidProgressLabel,
                        { color: textColor },
                      ]}
                    >
                      {bar.label}
                    </Text>
                    <Text
                      style={[
                        styles.androidProgressValue,
                        { color: valueColor },
                      ]}
                    >
                      {bar.value} {unitLabel}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>
      {totalPages > 1 && (
        <View style={styles.progressPagination}>
          <Pressable
            onPress={goOlder}
            disabled={!canGoOlder}
            accessibilityRole="button"
            accessibilityLabel="Ver sesiones anteriores"
            accessibilityState={{ disabled: !canGoOlder }}
            style={[styles.pageArrow, !canGoOlder && styles.pageArrowDisabled]}
          >
            <Text style={[styles.pageArrowText, { color: textColor }]}>‹</Text>
          </Pressable>
          <Text
            style={[styles.pageDateRange, { color: textColor }]}
            accessibilityLiveRegion="polite"
          >
            {dateRange}
          </Text>
          <Pressable
            onPress={goNewer}
            disabled={!canGoNewer}
            accessibilityRole="button"
            accessibilityLabel="Ver sesiones más recientes"
            accessibilityState={{ disabled: !canGoNewer }}
            style={[styles.pageArrow, !canGoNewer && styles.pageArrowDisabled]}
          >
            <Text style={[styles.pageArrowText, { color: textColor }]}>›</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  header: {
    height: 360,
    overflow: 'hidden',
  },
  card: {
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    minHeight: 400,
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
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  headerTitleOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 40,
  },
  headerTitleOverlayText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
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
    overflow: 'hidden',
  },
  progressPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  pageArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageArrowDisabled: {
    opacity: 0.3,
  },
  pageArrowText: {
    fontSize: 28,
  },
  pageDateRange: {
    fontSize: 12,
    textAlign: 'center',
  },
  progressLoading: {
    // Matches the chart's footprint (150px plot + x-axis labels) so the
    // layout doesn't jump when the data arrives.
    height: 180,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  progressLoadingText: {
    fontSize: 13,
    opacity: 0.6,
  },
  androidProgressList: {
    gap: 10,
  },
  androidProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  androidProgressLabel: {
    fontSize: 13,
    opacity: 0.7,
  },
  androidProgressValue: {
    fontSize: 14,
    fontWeight: '600',
  },
})
