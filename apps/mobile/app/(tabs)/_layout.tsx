import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native'
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs'
import React from 'react'
import { useColorScheme } from 'react-native'

import { Colors } from '@/constants/theme'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme
  const tintColor = Colors[colorScheme ?? 'light'].tint

  return (
    <ThemeProvider value={theme}>
      <NativeTabs
        minimizeBehavior="onScrollDown"
        tintColor={tintColor}
        labelStyle={{ color: theme.colors.text }}
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
    </ThemeProvider>
  )
}
