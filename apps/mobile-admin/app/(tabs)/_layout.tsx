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
import { useOrgSettings } from "@/hooks/use-org-settings";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { isOrgAdminRole } from "@/lib/security/roles";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const tintColor = Colors[colorScheme ?? "light"].tint;
  const tabBarBg = Colors[colorScheme ?? "light"].background;
  const orgSettings = useOrgSettings();
  const membership = useCurrentMembership();

  const showClasses = orgSettings?.classesEnabled !== false;
  const showFinance =
    orgSettings?.financeEnabled !== false && isOrgAdminRole(membership?.role);

  return (
    <ThemeProvider value={theme}>
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
        <NativeTabs.Trigger name="members">
          <NativeTabs.Trigger.Label>Miembros</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="person.2.fill"
            src={
              <NativeTabs.Trigger.VectorIcon
                family={MaterialIcons}
                name="people"
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
        {showFinance && (
          <NativeTabs.Trigger name="finance">
            <NativeTabs.Trigger.Label>Finanzas</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon
              sf="dollarsign.circle.fill"
              src={
                <NativeTabs.Trigger.VectorIcon
                  family={MaterialIcons}
                  name="account-balance-wallet"
                />
              }
            />
          </NativeTabs.Trigger>
        )}
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Label>Más</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf="ellipsis.circle.fill"
            src={
              <NativeTabs.Trigger.VectorIcon
                family={MaterialIcons}
                name="more-horiz"
              />
            }
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
