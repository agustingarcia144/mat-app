import React, { useMemo, useEffect, useCallback } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import {
  getYoutubeVideoId,
  getVideoThumbnailUrl,
} from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/ui/themed-view'
import { ThemedText } from '@/components/ui/themed-text'
import ParallaxScrollView from '@/components/ui/parallax-scroll-view'
import { useExerciseVideo } from '@/contexts/exercise-video-context'

const HEADER_BG = { light: '#e5e5e5', dark: '#262626' }

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
  }, [assignmentId, dayExerciseId, exerciseId, openVideo, router, youtubeVideoId])

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
      if (dayExercise.weight?.trim()) parts.push(dayExercise.weight.trim())
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
})
