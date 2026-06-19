import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { IconSymbol } from '@/components/ui/icon-symbol'

export interface WorkoutHeaderProps {
  title: string
  isDark: boolean
  insetsTop: number
  onBackPress: () => void
  showCalendar: boolean
  onCalendarPress: () => void
  showCta: boolean
  ctaLabel: string
  /** May be async; the button shows a spinner while it resolves. */
  onCtaPress: () => void | Promise<void>
}

/**
 * iOS custom header for the workout session. Replaces the native nav bar so the
 * trailing controls render as independent Liquid Glass buttons (the native
 * header groups all trailing buttons into a single shared glass capsule, which
 * can't be split on Expo SDK 55). Uses `expo-glass-effect` to mimic the native
 * material; falls back to a translucent fill on devices without Liquid Glass.
 */
export function WorkoutHeader({
  title,
  isDark,
  insetsTop,
  onBackPress,
  showCalendar,
  onCalendarPress,
  showCta,
  ctaLabel,
  onCtaPress,
}: WorkoutHeaderProps) {
  // Pending lives here (not in the parent screen) so a press only re-renders
  // this button instead of the whole workout screen.
  const [ctaLoading, setCtaLoading] = useState(false)
  const handleCtaPress = useCallback(() => {
    if (ctaLoading) return
    setCtaLoading(true)
    Promise.resolve(onCtaPress()).finally(() => setCtaLoading(false))
  }, [ctaLoading, onCtaPress])

  const tint = isDark ? '#fff' : '#000'
  const glassAvailable = isLiquidGlassAvailable()
  const glassScheme = isDark ? 'dark' : 'light'
  const iconFallbackBg = isDark ? 'rgba(60,60,67,0.6)' : 'rgba(120,120,128,0.24)'
  const ctaFill = isDark ? '#fff' : '#000'
  const ctaText = isDark ? '#000' : '#fff'

  return (
    <View
      style={[styles.container, { paddingTop: insetsTop + 6 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onBackPress}
        hitSlop={10}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <GlassView
          glassEffectStyle="regular"
          colorScheme={glassScheme}
          pointerEvents="none"
          style={[
            styles.glassFill,
            !glassAvailable && { backgroundColor: iconFallbackBg },
          ]}
        />
        <IconSymbol name="chevron.left" size={22} color={tint} />
      </Pressable>

      <Text
        style={[styles.title, { color: tint }]}
        numberOfLines={1}
        pointerEvents="none"
      >
        {title}
      </Text>

      <View style={styles.spacer} pointerEvents="none" />

      {showCalendar ? (
        <Pressable
          onPress={onCalendarPress}
          hitSlop={10}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <GlassView
            glassEffectStyle="regular"
            colorScheme={glassScheme}
            pointerEvents="none"
            style={[
              styles.glassFill,
              !glassAvailable && { backgroundColor: iconFallbackBg },
            ]}
          />
          <IconSymbol name="calendar" size={22} color={tint} />
        </Pressable>
      ) : null}

      {showCta ? (
        <Pressable
          onPress={handleCtaPress}
          disabled={ctaLoading}
          hitSlop={8}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && styles.pressed,
            ctaLoading && styles.ctaLoading,
          ]}
        >
          <GlassView
            glassEffectStyle="regular"
            tintColor={ctaFill}
            colorScheme={glassScheme}
            pointerEvents="none"
            style={[
              styles.glassFill,
              !glassAvailable && { backgroundColor: ctaFill },
            ]}
          />
          {ctaLoading ? (
            <ActivityIndicator size="small" color={ctaText} />
          ) : (
            <Text style={[styles.ctaText, { color: ctaText }]}>{ctaLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

const ICON_SIZE = 40
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  glassFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ICON_SIZE / 2,
  },
  iconButton: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  ctaButton: {
    height: ICON_SIZE,
    minWidth: 104,
    paddingHorizontal: 18,
    borderRadius: ICON_SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
  },
  ctaLoading: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.6,
  },
})
