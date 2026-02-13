import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
} from 'react-native'
import { PressableScale } from 'pressto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from 'convex/react'
import { api } from '@repo/convex'
import { getVideoThumbnailUrl } from '@repo/core/utils'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import ParallaxScrollView from '@/components/parallax-scroll-view'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { Colors } from '@/constants/theme'
import { ThemedPressable } from '@/components/themed-pressable'

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
    <PressableScale style={styles.headerImageWrap} onPress={openVideo}>
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.headerImage}
        resizeMode="cover"
      />
    </PressableScale>
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

      {hasVideo && (
        <View
          style={[
            styles.stickyFooter,
            {
              paddingBottom: insets.bottom + 60,
              backgroundColor: Colors[colorScheme ?? 'light'].background,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                },
                android: { elevation: 6 },
              }),
            },
          ]}
        >
          <ThemedPressable type="primary" onPress={openVideo}>
            <View style={styles.footerButtonContent}>
              <MaterialIcons
                name="play-arrow"
                size={22}
                color={colorScheme === 'dark' ? '#000' : '#fff'}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: colorScheme === 'dark' ? '#000' : '#fff' },
                ]}
              >
                Ver video
              </Text>
            </View>
          </ThemedPressable>
        </View>
      )}
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
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
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
  footerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
