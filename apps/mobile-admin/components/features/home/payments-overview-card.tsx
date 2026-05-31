import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export function PaymentsOverviewCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const billingPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const payments = useQuery(api.planPayments.getByOrganization, {});

  const counts = useMemo(() => {
    const result = { paid: 0, pending: 0, declined: 0 };
    if (!payments) return result;
    for (const payment of payments as any[]) {
      if (payment.billingPeriod !== billingPeriod) continue;
      if (payment.status === "approved") result.paid += 1;
      else if (payment.status === "declined") result.declined += 1;
      else result.pending += 1;
    }
    return result;
  }, [payments, billingPeriod]);

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
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Pagos del mes
        </ThemedText>
        <MaterialIcons
          name="payments"
          size={20}
          color={isDark ? Colors.dark.icon : Colors.light.icon}
        />
      </View>

      <View style={styles.row}>
        <Stat label="Pagos" value={counts.paid} accent="#22c55e" />
        <Stat label="Pendientes" value={counts.pending} accent="#f97316" />
        <Stat label="Rechazados" value={counts.declined} accent="#ef4444" />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statValue, { color: accent }]}>
        {value}
      </ThemedText>
      <ThemedText
        style={[
          styles.statLabel,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
});
