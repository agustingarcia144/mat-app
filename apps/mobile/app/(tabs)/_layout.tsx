import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme
} from '@react-navigation/native'
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import React from 'react'
import { Platform } from 'react-native'
import { useColorScheme } from '@/hooks/use-color-scheme'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { Colors } from '@/constants/theme'
import { ExerciseVideoProvider } from '@/contexts/exercise-video-context'
import { useOrgSettings } from '@/hooks/use-org-settings'
import { useAvatarIcon } from '@/contexts/avatar-icon-context'
import { AVATAR_SCALE } from '@/components/features/profile/circular-avatar-rasterizer'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme
  const tintColor = Colors[colorScheme ?? 'light'].tint
  const tabBarBg = Colors[colorScheme ?? 'light'].background
  const orgSettings = useOrgSettings()

  const showClasses = orgSettings?.classesEnabled !== false

  // The circular avatar is rasterized in AvatarIconProvider. Until it is ready
  // we fall back to the (sized) square crop so the icon never renders full-bleed.
  const { squareUri, circularDataUri } = useAvatarIcon()
  const avatarIconUri = circularDataUri ?? squareUri
  // Size is controlled purely by `scale`: the PNG is AVATAR_PX wide, so at
  // scale AVATAR_SCALE it renders at AVATAR_PX / AVATAR_SCALE pt. Passing
  // width/height here would override that and make iOS render it full-size.
  const avatarIconSource = avatarIconUri
    ? { uri: avatarIconUri, scale: AVATAR_SCALE }
    : null

  return (
    <ThemeProvider value={theme}>
      <ExerciseVideoProvider>
        <NativeTabs
          minimizeBehavior="onScrollDown"
          tintColor={tintColor}
          labelStyle={{ color: theme.colors.text }}
          backgroundColor={tabBarBg}
          {...(Platform.OS === 'ios' && {
            blurEffect: 'none' as const,
            disableTransparentOnScrollEdge: true
          })}
        >
          <NativeTabs.Trigger name="home">
            <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              sf="house.fill"
              src={
                <NativeTabs.Trigger.VectorIcon
                  family={MaterialIcons}
                  name="home"
                />
              }
            />
          </NativeTabs.Trigger>
          {showClasses && (
            <NativeTabs.Trigger name="classes">
              <NativeTabs.Trigger.Label>Clases</NativeTabs.Trigger.Label>
              <NativeTabs.Trigger.Icon
                sf="calendar"
                src={
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialIcons}
                    name="calendar-today"
                  />
                }
              />
            </NativeTabs.Trigger>
          )}
          <NativeTabs.Trigger name="plan">
            <NativeTabs.Trigger.Label>Pagos</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              sf="creditcard.fill"
              src={
                <NativeTabs.Trigger.VectorIcon
                  family={MaterialIcons}
                  name="credit-card"
                />
              }
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
            {avatarIconSource ? (
              // iOS only: the rasterized circular photo (Android tints icons, so
              // it falls through to the vector person icon below).
              <NativeTabs.Trigger.Icon
                src={avatarIconSource}
                renderingMode="original"
              />
            ) : (
              <NativeTabs.Trigger.Icon
                sf="person.crop.circle"
                src={
                  <NativeTabs.Trigger.VectorIcon
                    family={MaterialIcons}
                    name="account-circle"
                  />
                }
              />
            )}
          </NativeTabs.Trigger>
        </NativeTabs>
      </ExerciseVideoProvider>
    </ThemeProvider>
  )
}
