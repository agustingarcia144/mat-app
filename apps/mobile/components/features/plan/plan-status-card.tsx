import React from "react";
import { StyleSheet, View, Text } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "#22c55e" },
  suspended: { label: "Suspendido", color: "#ef4444" },
  cancelled: { label: "Cancelado", color: "#6b7280" },
};

interface PlanStatusCardProps {
  plan: {
    name: string;
    priceArs: number;
    weeklyClassLimit: number;
    paymentWindowStartDay: number;
    paymentWindowEndDay: number;
  } | null;
  status: string;
  weeklyUsed: number;
  weeklyLimit: number;
}

export default function PlanStatusCard({
  plan,
  status,
  weeklyUsed,
  weeklyLimit,
}: PlanStatusCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.active;

  if (!plan) return null;

  const isUnlimited = weeklyLimit >= 9999;
  const remaining = isUnlimited
    ? Infinity
    : Math.max(0, weeklyLimit - weeklyUsed);
  const progressRatio =
    isUnlimited || weeklyLimit === 0 ? 0 : weeklyUsed / weeklyLimit;

  return (
    <View
      style={[styles.card, { backgroundColor: isDark ? "#1c1c1e" : "#f5f5f5" }]}
    >
      <View style={styles.header}>
        <Text style={[styles.planName, { color: isDark ? "#fff" : "#000" }]}>
          {plan.name}
        </Text>
        <View
          style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}
        >
          <Text style={styles.statusText}>{statusInfo.label}</Text>
        </View>
      </View>

      <Text style={[styles.price, { color: isDark ? "#fff" : "#000" }]}>
        ${plan.priceArs.toLocaleString("es-AR")}
        <Text style={styles.priceSuffix}>/mes</Text>
      </Text>

      {/* Weekly progress */}
      <View style={styles.weeklySection}>
        <View style={styles.weeklyHeader}>
          <Text
            style={[styles.weeklyLabel, { color: isDark ? "#ccc" : "#444" }]}
          >
            Clases esta semana
          </Text>
          <Text
            style={[styles.weeklyCount, { color: isDark ? "#fff" : "#000" }]}
          >
            {isUnlimited ? `${weeklyUsed}/∞` : `${weeklyUsed}/${weeklyLimit}`}
          </Text>
        </View>
        <View
          style={[
            styles.progressBar,
            { backgroundColor: isDark ? "#333" : "#ddd" },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, progressRatio * 100)}%`,
                backgroundColor:
                  progressRatio >= 1
                    ? "#ef4444"
                    : progressRatio >= 0.7
                      ? "#f59e0b"
                      : "#22c55e",
              },
            ]}
          />
        </View>
        <Text
          style={[styles.remainingText, { color: isDark ? "#aaa" : "#666" }]}
        >
          {isUnlimited
            ? "Sin límite semanal"
            : remaining === 0
              ? "Llegaste al límite semanal"
              : `${remaining} clase${remaining === 1 ? "" : "s"} disponible${remaining === 1 ? "" : "s"}`}
        </Text>
      </View>

      <Text style={[styles.windowText, { color: isDark ? "#aaa" : "#666" }]}>
        Ventana de pago: del {plan.paymentWindowStartDay} al{" "}
        {plan.paymentWindowEndDay} de cada mes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planName: {
    fontSize: 18,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  price: {
    fontSize: 24,
    fontWeight: "700",
  },
  priceSuffix: {
    fontSize: 14,
    fontWeight: "400",
    opacity: 0.6,
  },
  weeklySection: {
    gap: 6,
  },
  weeklyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weeklyLabel: {
    fontSize: 14,
  },
  weeklyCount: {
    fontSize: 16,
    fontWeight: "700",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  remainingText: {
    fontSize: 13,
  },
  windowText: {
    fontSize: 13,
  },
});
