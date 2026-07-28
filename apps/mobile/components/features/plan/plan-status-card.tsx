import React from "react";
import { StyleSheet, View, Text } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { IconSymbol } from "@/components/ui/icon-symbol";

const STATUS_VISUALS: Record<
  string,
  { label: string; accent: (dark: boolean) => string; tint: string }
> = {
  active: {
    label: "Activo",
    accent: (dark) => (dark ? "#4ade80" : "#16a34a"),
    tint: "rgba(34,197,94,0.16)",
  },
  suspended: {
    label: "Suspendido",
    accent: (dark) => (dark ? "#f87171" : "#dc2626"),
    tint: "rgba(239,68,68,0.16)",
  },
  cancelled: {
    label: "Cancelado",
    accent: (dark) => (dark ? "#a1a1aa" : "#71717a"),
    tint: "rgba(113,113,122,0.18)",
  },
};

interface PlanStatusCardProps {
  plan: {
    name: string;
    priceArs: number;
    weeklyClassLimit: number;
    billingMode?: "calendar" | "join_date";
    paymentWindowStartDay: number;
    paymentWindowEndDay: number;
  } | null;
  status: string;
  monthlyUsed: number;
  monthlyLimit: number;
  /** Names of the classes the plan includes; empty means every class */
  includedClassNames?: string[];
  /** False when the plan grants no class access at all */
  classesEnabled?: boolean;
}

export default function PlanStatusCard({
  plan,
  status,
  monthlyUsed,
  monthlyLimit,
  includedClassNames = [],
  classesEnabled = true,
}: PlanStatusCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const statusInfo = STATUS_VISUALS[status] ?? STATUS_VISUALS.active;
  const accent = statusInfo.accent(isDark);

  if (!plan) return null;

  const isUnlimited = monthlyLimit >= 9999;
  const remaining = isUnlimited
    ? Infinity
    : Math.max(0, monthlyLimit - monthlyUsed);
  const progressRatio =
    isUnlimited || monthlyLimit === 0 ? 0 : monthlyUsed / monthlyLimit;
  const progressColor =
    progressRatio >= 1 ? "#ef4444" : progressRatio >= 0.7 ? "#f59e0b" : "#22c55e";

  return (
    <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: statusInfo.tint }]}>
          <IconSymbol name="bolt.fill" size={22} color={accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.planName, { color: isDark ? "#fff" : "#000" }]}>
            {plan.name}
          </Text>
          <Text style={[styles.price, { color: isDark ? "#fff" : "#000" }]}>
            ${plan.priceArs.toLocaleString("es-AR")}
            <Text style={styles.priceSuffix}>/mes</Text>
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusInfo.tint }]}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <Text style={[styles.statusText, { color: accent }]}>
            {statusInfo.label}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.divider,
          { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
        ]}
      />

      {/* Monthly class usage — hidden when the plan has no class access */}
      {!classesEnabled ? (
        <View style={styles.usageSection}>
          <Text
            style={[
              styles.usageLabel,
              { color: isDark ? "#a1a1aa" : "#52525b" },
            ]}
          >
            Este plan no incluye clases
          </Text>
        </View>
      ) : (
      <View style={styles.usageSection}>
        <View style={styles.usageHeader}>
          <Text
            style={[styles.usageLabel, { color: isDark ? "#a1a1aa" : "#52525b" }]}
          >
            Clases este mes
          </Text>
          <Text style={[styles.usageCount, { color: isDark ? "#fff" : "#000" }]}>
            {isUnlimited ? `${monthlyUsed}/∞` : `${monthlyUsed}/${monthlyLimit}`}
          </Text>
        </View>
        <View
          style={[
            styles.progressBar,
            { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: isUnlimited
                  ? "100%"
                  : `${Math.min(100, progressRatio * 100)}%`,
                backgroundColor: isUnlimited ? "#22c55e" : progressColor,
              },
            ]}
          />
        </View>
        <Text
          style={[styles.remainingText, { color: isDark ? "#71717a" : "#71717a" }]}
        >
          {isUnlimited
            ? "Sin límite mensual"
            : remaining === 0
              ? "Llegaste al límite mensual"
              : `${remaining} clase${remaining === 1 ? "" : "s"} disponible${remaining === 1 ? "" : "s"}`}
        </Text>
      </View>
      )}

      {includedClassNames.length > 0 ? (
        <View style={styles.windowRow}>
          <IconSymbol
            name="checkmark"
            size={14}
            color={isDark ? "#71717a" : "#a1a1aa"}
          />
          <Text
            style={[styles.windowText, { color: isDark ? "#71717a" : "#71717a" }]}
          >
            Clases incluidas: {includedClassNames.join(", ")}
          </Text>
        </View>
      ) : null}

      <View style={styles.windowRow}>
        <IconSymbol
          name="calendar"
          size={14}
          color={isDark ? "#71717a" : "#a1a1aa"}
        />
        <Text style={[styles.windowText, { color: isDark ? "#71717a" : "#71717a" }]}>
          {(plan.billingMode ?? "calendar") === "join_date"
            ? "Cobro mensual según fecha de ingreso"
            : `Ventana de pago: del ${plan.paymentWindowStartDay} al ${plan.paymentWindowEndDay} de cada mes`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  planName: {
    fontSize: 17,
    fontWeight: "700",
  },
  price: {
    fontSize: 20,
    fontWeight: "700",
  },
  priceSuffix: {
    fontSize: 13,
    fontWeight: "400",
    opacity: 0.6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  usageSection: {
    gap: 8,
  },
  usageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  usageLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  usageCount: {
    fontSize: 15,
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
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  windowText: {
    fontSize: 12,
    flex: 1,
  },
});
