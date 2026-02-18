import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native'
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs'
import React from 'react'
import { Platform, useColorScheme } from 'react-native'

import { Colors } from '@/constants/theme'
import { ExerciseVideoProvider } from '@/contexts/exercise-video-context'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme
  const tintColor = Colors[colorScheme ?? 'light'].tint
  const tabBarBg = Colors[colorScheme ?? 'light'].background

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
            disableTransparentOnScrollEdge: true,
          })}
        >
          <NativeTabs.Trigger name="home">
            <Label>Inicio</Label>
            <Icon sf="house.fill" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="classes">
            <Label>Clases</Label>
            <Icon sf="calendar" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="planifications">
            <Label>Planificaciones</Label>
            <Icon sf="list.bullet" />
          </NativeTabs.Trigger>
        </NativeTabs>
      </ExerciseVideoProvider>
    </ThemeProvider>
  )
}
