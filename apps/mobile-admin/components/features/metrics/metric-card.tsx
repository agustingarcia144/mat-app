import React from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type MetricCardProps = {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
};

export function MetricCard({
  label,
  value,
  subtitle,
  trend,
  trendLabel,
}: MetricCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const trendColor =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <ThemedText
        style={[
          styles.label,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText type="title" style={styles.value}>
        {value}
      </ThemedText>
      {subtitle || trendLabel ? (
        <View style={styles.subtitleRow}>
          {trendLabel ? (
            <ThemedText style={[styles.trend, trendColor ? { color: trendColor } : undefined]}>
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}{" "}
              {trendLabel}
            </ThemedText>
          ) : null}
          {subtitle ? (
            <ThemedText
              style={[
                styles.subtitle,
                { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
              ]}
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flex: 1,
    minWidth: 140,
  },
  label: { fontSize: 12, marginBottom: 4 },
  value: { fontSize: 24, lineHeight: 28 },
  subtitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  trend: { fontSize: 12, fontWeight: "600" },
  subtitle: { fontSize: 12 },
});
