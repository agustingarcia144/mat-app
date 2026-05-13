import React from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";

const STATUS_MAP: Record<string, { label: string; bgLight: string; bgDark: string; textLight: string; textDark: string }> = {
  pending: { label: "Pendiente", bgLight: "#fef3c7", bgDark: "rgba(245,158,11,0.2)", textLight: "#92400e", textDark: "#fbbf24" },
  in_review: { label: "En revisión", bgLight: "#dbeafe", bgDark: "rgba(59,130,246,0.2)", textLight: "#1e40af", textDark: "#93c5fd" },
  approved: { label: "Aprobado", bgLight: "#dcfce7", bgDark: "rgba(34,197,94,0.2)", textLight: "#166534", textDark: "#86efac" },
  declined: { label: "Rechazado", bgLight: "#fee2e2", bgDark: "rgba(239,68,68,0.2)", textLight: "#991b1b", textDark: "#fca5a5" },
};

export function PaymentStatusPill({ status }: { status: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const s = STATUS_MAP[status] ?? STATUS_MAP.pending;

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: isDark ? s.bgDark : s.bgLight },
      ]}
    >
      <ThemedText
        style={[styles.text, { color: isDark ? s.textDark : s.textLight }]}
      >
        {s.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999 },
  text: { fontSize: 11, fontWeight: "600" },
});
