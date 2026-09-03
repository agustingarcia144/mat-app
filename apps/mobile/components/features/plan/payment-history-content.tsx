import React from "react";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedView } from "@/components/ui/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";

const STATUS_VISUALS: Record<string, { label: string; accent: string; tint: string }> =
  {
    pending: { label: "Pendiente", accent: "#f59e0b", tint: "rgba(245,158,11,0.16)" },
    in_review: { label: "En revisión", accent: "#3b82f6", tint: "rgba(59,130,246,0.16)" },
    approved: { label: "Aprobado", accent: "#22c55e", tint: "rgba(34,197,94,0.16)" },
    declined: { label: "Rechazado", accent: "#ef4444", tint: "rgba(239,68,68,0.16)" },
    bonification: { label: "Bonificado", accent: "#a855f7", tint: "rgba(168,85,247,0.16)" },
    advance_covered: { label: "Pagado por adelantado", accent: "#22c55e", tint: "rgba(34,197,94,0.16)" },
    advance_reserved: { label: "En tu pago adelantado", accent: "#3b82f6", tint: "rgba(59,130,246,0.16)" },
  };

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const monthNames = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  const monthIndex = parseInt(month!, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

export default function PaymentHistoryContent() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const payments = useQuery(api.planPayments.getMyPayments);
  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription);

  if (payments === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  if (payments.length === 0) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <View
          style={[
            styles.emptyIcon,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.05)",
            },
          ]}
        >
          <IconSymbol
            name="list.bullet"
            size={28}
            color={isDark ? "#52525b" : "#a1a1aa"}
          />
        </View>
        <Text style={[styles.emptyText, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
          No hay pagos registrados todavía.
        </Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlashList
        data={payments}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{
          paddingTop: insets.top + 60,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 16,
        }}
        renderItem={({ item }) => {
          const isBonification =
            (item as any).isBonification ||
            (item as any).paymentMethod === "bonification";
          // A month bought through a multi-month advance: it carries no money
          // of its own, so the plain "Pendiente"/"Aprobado" labels would read
          // as an unpaid month or an unexplained $0 one.
          const advanceCoveredKey = (item as any).advanceCoveredByPaymentId
            ? item.status === "approved"
              ? "advance_covered"
              : "advance_reserved"
            : null;
          const statusInfo = isBonification
            ? STATUS_VISUALS.bonification
            : advanceCoveredKey
              ? STATUS_VISUALS[advanceCoveredKey]!
              : (STATUS_VISUALS[item.status] ?? STATUS_VISUALS.pending);
          const amountArs =
            (item as any).payableAmountArs ??
            (item as any).totalAmountArs ??
            (!isBonification && item.amountArs <= 0
              ? subscription?.plan?.priceArs
              : undefined) ??
            item.amountArs;
          return (
            <View
              style={[styles.row, isDark ? styles.rowDark : styles.rowLight]}
            >
              <View style={[styles.iconTile, { backgroundColor: statusInfo.tint }]}>
                <IconSymbol name="calendar" size={20} color={statusInfo.accent} />
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.period, { color: isDark ? "#fff" : "#000" }]}>
                  {formatBillingPeriod(item.billingPeriod)}
                </Text>
                <Text style={[styles.amount, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
                  ${amountArs.toLocaleString("es-AR")}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusInfo.tint }]}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.accent }]} />
                <Text style={[styles.statusText, { color: statusInfo.accent }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  rowDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  period: {
    fontSize: 16,
    fontWeight: "700",
  },
  amount: {
    fontSize: 14,
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
  separator: {
    height: 10,
  },
});
