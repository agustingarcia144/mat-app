import React, { useMemo } from 'react'
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
  Linking,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import ParallaxScrollView from '@/components/parallax-scroll-view'

const HEADER_BG = { light: '#e5e5e5', dark: '#262626' }

function ExerciseDetailContent() {
  const { exerciseId, dayExerciseId } = useLocalSearchParams<{
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

  const thumbnailUrl = useMemo(() => {
    if (!exercise?.videoUrl) return null
    return getVideoThumbnailUrl(exercise.videoUrl)
  }, [exercise?.videoUrl])

  const openVideo = () => {
    if (exercise?.videoUrl) Linking.openURL(exercise.videoUrl)
  }

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
    <Pressable style={styles.headerImageWrap} onPress={openVideo}>
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
        { backgroundColor: HEADER_BG[colorScheme ?? 'light'] },
      ]}
    />
  )

  return (
    <ThemedView style={styles.container}>
      <ParallaxScrollView
        headerImage={headerImage}
        headerBackgroundColor={HEADER_BG}
      >
        <ThemedText style={styles.title}>{exercise.name}</ThemedText>

        {hasDescription && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>Descripción</ThemedText>
            <ThemedText style={styles.body}>{exercise.description}</ThemedText>
          </View>
        )}

        {hasDayNotes && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionLabel}>
              Notas del entrenamiento
            </ThemedText>
            <ThemedText style={styles.body}>{dayExercise!.notes}</ThemedText>
          </View>
        )}

        {exercise.videoUrl && !thumbnailUrl && (
          <Pressable onPress={openVideo} style={styles.videoLink}>
            <ThemedText type="link">Ver video en YouTube</ThemedText>
          </Pressable>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ParallaxScrollView>
    </ThemedView>
  )
}

export default function ExerciseDetailScreen() {
  return <ExerciseDetailContent />
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
  },
  headerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  headerCta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.9,
  },
  videoLink: {
    marginTop: 8,
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
