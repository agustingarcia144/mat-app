import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { Colors } from "@/constants/theme";

export default function FinanceIndexScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const orgSettings = useOrgSettings();

  const cards: {
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    href: string;
    visible: boolean;
  }[] = [
    {
      label: "Pagos",
      icon: "payments",
      href: "/(tabs)/more/payments",
      visible: true,
    },
    {
      label: "Ingresos y egresos",
      icon: "account-balance-wallet",
      href: "/(tabs)/finance",
      visible: orgSettings?.financeEnabled !== false,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <View style={styles.content}>
          {cards
            .filter((c) => c.visible)
            .map((card) => (
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
                  size={32}
                  color={isDark ? "#fff" : "#000"}
                />
                <ThemedText type="defaultSemiBold" style={styles.cardLabel}>
                  {card.label}
                </ThemedText>
              </ThemedPressable>
            ))}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 20, gap: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderWidth: 1,
    borderRadius: 16,
  },
  cardLabel: { fontSize: 16 },
});
