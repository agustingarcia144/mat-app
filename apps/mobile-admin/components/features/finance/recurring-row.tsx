import React from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type RecurringRowProps = {
  title: string;
  category?: string;
  amountArs: number;
  dayOfMonth: number;
  status: string;
  onPress: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

export function RecurringRow({
  title,
  category,
  amountArs,
  dayOfMonth,
  status,
  onPress,
}: RecurringRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const statusColor =
    status === "active" ? "#22c55e" : status === "paused" ? "#f59e0b" : "#a1a1aa";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
          opacity: status === "cancelled" ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText
          style={[
            styles.meta,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
          numberOfLines={1}
        >
          {category ? `${category} · ` : ""}Día {dayOfMonth}
        </ThemedText>
      </View>
      <View style={styles.right}>
        <ThemedText type="defaultSemiBold" style={styles.amount}>
          ${amountArs.toLocaleString("es-AR")}
        </ThemedText>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <ThemedText style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[status] ?? status}
          </ThemedText>
        </View>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={20}
        color={isDark ? Colors.dark.subtle : Colors.light.subtle}
      />
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 10,
  },
  info: { flex: 1 },
  meta: { fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 4 },
  amount: { fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "500" },
});
