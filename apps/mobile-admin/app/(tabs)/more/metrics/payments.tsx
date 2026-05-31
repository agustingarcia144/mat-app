import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { PieChart } from "react-native-gifted-charts";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { MetricCard } from "@/components/features/metrics/metric-card";
import { MonthPicker } from "@/components/ui/month-picker";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { isOrgAdminRole } from "@/lib/security/roles";
import { Colors } from "@/constants/theme";

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function PaymentMetricsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const membership = useCurrentMembership();

  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));
  const metrics = useQuery(api.planPayments.getOrganizationMetrics, {
    selectedPeriod: period,
  });

  if (!isOrgAdminRole(membership?.role)) {
    router.replace("/(tabs)/more/metrics" as any);
    return null;
  }

  if (!metrics) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  const overview = metrics.overview;
  const selOv = metrics.selectedOverview;
  const cmp = metrics.comparison;

  const pieData = (metrics.paymentMethods ?? []).map((pm: any, i: number) => ({
    value: pm.count ?? pm.percentage ?? 0,
    color: PIE_COLORS[i % PIE_COLORS.length],
    text: pm.method ?? pm.label ?? "",
  }));

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <MonthPicker value={period} onChange={setPeriod} />

          <View style={styles.cardRow}>
            <MetricCard
              label="Cobranza"
              value={`${(selOv?.collectionRatePct ?? overview.collectionRatePct ?? 0).toFixed(0)}%`}
              trend={
                cmp?.collectionRateDeltaPct != null
                  ? cmp.collectionRateDeltaPct > 0
                    ? "up"
                    : cmp.collectionRateDeltaPct < 0
                      ? "down"
                      : "flat"
                  : undefined
              }
              trendLabel={
                cmp?.collectionRateDeltaPct != null
                  ? `${cmp.collectionRateDeltaPct > 0 ? "+" : ""}${cmp.collectionRateDeltaPct.toFixed(1)}%`
                  : undefined
              }
            />
            <MetricCard
              label="Aprobados"
              value={`${(overview.approvalRatePct ?? 0).toFixed(0)}%`}
            />
          </View>

          <View style={styles.cardRow}>
            <MetricCard
              label="Impagos"
              value={`${(overview.unpaidRatePct ?? 0).toFixed(0)}%`}
            />
            <MetricCard
              label="Ingresos"
              value={`$${(selOv?.approvedAmountArs ?? overview.approvedRevenueArs ?? 0).toLocaleString("es-AR")}`}
              trend={
                cmp?.approvedAmountDeltaArs != null
                  ? cmp.approvedAmountDeltaArs > 0
                    ? "up"
                    : cmp.approvedAmountDeltaArs < 0
                      ? "down"
                      : "flat"
                  : undefined
              }
              trendLabel={
                cmp?.approvedAmountDeltaArs != null
                  ? `$${Math.abs(cmp.approvedAmountDeltaArs).toLocaleString("es-AR")}`
                  : undefined
              }
            />
          </View>

          {pieData.length > 0 ? (
            <View
              style={[
                styles.section,
                {
                  borderColor: isDark ? Colors.dark.border : Colors.light.border,
                  backgroundColor: isDark ? Colors.dark.muted : "#fff",
                },
              ]}
            >
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Métodos de pago
              </ThemedText>
              <View style={styles.pieWrapper}>
                <PieChart
                  data={pieData}
                  radius={80}
                  innerRadius={50}
                  centerLabelComponent={() => (
                    <ThemedText type="defaultSemiBold" style={{ fontSize: 12 }}>
                      Pagos
                    </ThemedText>
                  )}
                />
              </View>
              <View style={styles.legendList}>
                {pieData.map((d: any, i: number) => (
                  <View key={i} style={styles.legendRow}>
                    <View
                      style={[styles.legendDot, { backgroundColor: d.color }]}
                    />
                    <ThemedText style={styles.legendText}>{d.text}</ThemedText>
                    <ThemedText style={styles.legendValue}>{d.value}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {(metrics.planBreakdown ?? []).length > 0 ? (
            <View
              style={[
                styles.section,
                {
                  borderColor: isDark ? Colors.dark.border : Colors.light.border,
                  backgroundColor: isDark ? Colors.dark.muted : "#fff",
                },
              ]}
            >
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Rendimiento por plan
              </ThemedText>
              {(metrics.planBreakdown as any[]).map((plan: any, i: number) => (
                <View key={i} style={styles.planRow}>
                  <ThemedText style={styles.planName} numberOfLines={1}>
                    {plan.planName ?? plan.name ?? "—"}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.planMeta,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {plan.memberCount ?? 0} miembros ·{" "}
                    {(plan.collectionRatePct ?? 0).toFixed(0)}%
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  cardRow: { flexDirection: "row", gap: 12 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 14, marginBottom: 12 },
  pieWrapper: { alignItems: "center", marginBottom: 12 },
  legendList: { gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, fontSize: 13 },
  legendValue: { fontSize: 13, fontWeight: "500" },
  planRow: { paddingVertical: 8, borderBottomWidth: 0 },
  planName: { fontSize: 14, fontWeight: "500" },
  planMeta: { fontSize: 12, marginTop: 2 },
});
