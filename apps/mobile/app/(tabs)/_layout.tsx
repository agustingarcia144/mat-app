import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { Platform } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { Colors } from "@/constants/theme";
import { ExerciseVideoProvider } from "@/contexts/exercise-video-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const tintColor = Colors[colorScheme ?? "light"].tint;
  const tabBarBg = Colors[colorScheme ?? "light"].background;

  return (
    <ThemeProvider value={theme}>
      <ExerciseVideoProvider>
        <NativeTabs
          minimizeBehavior="onScrollDown"
          tintColor={tintColor}
          labelStyle={{ color: theme.colors.text }}
          backgroundColor={tabBarBg}
          {...(Platform.OS === "ios" && {
            blurEffect: "none" as const,
            disableTransparentOnScrollEdge: true,
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
          <NativeTabs.Trigger name="plan">
            <NativeTabs.Trigger.Label>Mi Plan</NativeTabs.Trigger.Label>
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
        </NativeTabs>
      </ExerciseVideoProvider>
    </ThemeProvider>
  );
}
