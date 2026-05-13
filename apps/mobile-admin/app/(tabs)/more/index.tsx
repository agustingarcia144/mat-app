import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { isOrgAdminRole } from "@/lib/security/roles";

type CardItem = {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: string;
  adminOnly?: boolean;
  flag?: "planificationsEnabled" | "classesEnabled" | "financeEnabled";
};

const CARDS: CardItem[] = [
  { label: "Perfil", icon: "person", href: "/(tabs)/more/profile" },
  {
    label: "Configuración",
    icon: "settings",
    href: "/(tabs)/more/settings",
    adminOnly: true,
  },
  {
    label: "Usuarios",
    icon: "group",
    href: "/(tabs)/more/users",
    adminOnly: true,
  },
  {
    label: "Ejercicios",
    icon: "fitness-center",
    href: "/(tabs)/more/exercises",
    flag: "planificationsEnabled",
  },
  {
    label: "Pagos",
    icon: "payments",
    href: "/(tabs)/more/payments",
  },
  {
    label: "Métricas",
    icon: "bar-chart",
    href: "/(tabs)/more/metrics",
  },
];

export default function MoreScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const membership = useCurrentMembership();
  const orgSettings = useOrgSettings();
  const isAdmin = isOrgAdminRole(membership?.role);

  const visible = CARDS.filter((c) => {
    if (c.adminOnly && !isAdmin) return false;
    if (c.flag && orgSettings?.[c.flag] === false) return false;
    return true;
  });

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {visible.map((card) => (
              <ThemedPressable
                key={card.href}
                type="secondary"
                lightColor="#f4f4f5"
                darkColor="#18181b"
                style={[
                  styles.card,
                  {
                    borderColor: isDark
                      ? Colors.dark.border
                      : Colors.light.border,
                  },
                ]}
                onPress={() => router.push(card.href as any)}
              >
                <MaterialIcons
                  name={card.icon}
                  size={28}
                  color={isDark ? "#fff" : "#000"}
                />
                <ThemedText type="defaultSemiBold" style={styles.cardLabel}>
                  {card.label}
                </ThemedText>
              </ThemedPressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 20, gap: 16 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "47%",
    aspectRatio: 1.4,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  cardLabel: { fontSize: 14 },
});
