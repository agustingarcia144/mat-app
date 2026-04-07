import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native'
import {
  NativeTabs,
  Icon,
  Label,
  VectorIcon,
} from 'expo-router/unstable-native-tabs'
import React from 'react'
import { Platform, useColorScheme } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

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
            <Icon
              sf="house.fill"
              androidSrc={
                <VectorIcon family={MaterialIcons} name="home" />
              }
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="classes">
            <Label>Clases</Label>
            <Icon
              sf="calendar"
              androidSrc={
                <VectorIcon family={MaterialIcons} name="calendar-today" />
              }
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="plan">
            <Label>Mi Plan</Label>
            <Icon
              sf="creditcard.fill"
              androidSrc={
                <VectorIcon family={MaterialIcons} name="credit-card" />
              }
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="planifications">
            <Label>Planificaciones</Label>
            <Icon
              sf="list.bullet"
              androidSrc={
                <VectorIcon
                  family={MaterialIcons}
                  name="format-list-bulleted"
                />
              }
            />
          </NativeTabs.Trigger>
        </NativeTabs>
      </ExerciseVideoProvider>
    </ThemeProvider>
  )
}
