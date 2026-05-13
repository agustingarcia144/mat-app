import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { isOrgAdminRole } from "@/lib/security/roles";

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normalize(value?: string) {
  return value?.toLowerCase().trim() ?? "";
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { month: "short" }).format(date);
}

function shortPeriodLabel(period?: string) {
  if (!period) return "";
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return monthLabel(new Date(year, month - 1, 1));
}

function startOfDateMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatCompactCurrency(value?: number | null) {
  if (value == null) return "-";
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 1_000_000) return `$${(rounded / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(rounded / 1_000)}k`;
  return `$${rounded.toLocaleString("es-AR")}`;
}

function formatPercent(value?: number | null) {
  if (value == null) return "-";
  return `${value.toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  })}%`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { user } = useUser();
  const [now, setNow] = useState(() => Date.now());

  const membership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    {},
  );
  const convexUser = useQuery(api.users.getCurrentUser);
  const orgSettings = useQuery(api.organizationSettings.get);
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    { includeInactive: true },
  );
  const subscriptions = useQuery(api.memberPlanSubscriptions.getByOrganization, {});

  const isAdmin = isOrgAdminRole(membership?.role);
  const showFinance = isAdmin && orgSettings?.financeEnabled !== false;
  const showClasses = orgSettings?.classesEnabled !== false;
  const paymentMetrics = useQuery(
    api.planPayments.getOrganizationMetrics,
    showFinance ? {} : "skip",
  );
  const schedules = useQuery(
    api.classSchedules.getUpcoming,
    showClasses ? { limit: 20 } : "skip",
  );
  const classes = useQuery(
    api.classes.getByOrganization,
    showClasses ? { activeOnly: true } : "skip",
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const memberMemberships = useMemo(
    () => (memberships ?? []).filter((member: any) => normalize(member.role) === "member"),
    [memberships],
  );

  const assignedPlanUserIds = useMemo(
    () =>
      new Set(
        (subscriptions ?? [])
          .filter((subscription: any) => subscription.status !== "cancelled")
          .map((subscription: any) => subscription.userId),
      ),
    [subscriptions],
  );

  const monthlyMembers = useMemo(() => {
    const currentMonth = startOfDateMonth(new Date());
    const defaultStartMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 5,
      1,
    );
    const currentMonthKey = monthKey(currentMonth);

    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(
        defaultStartMonth.getFullYear(),
        defaultStartMonth.getMonth() + index,
        1,
      );
      const startAt = date.getTime();
      const endAt = endOfMonth(date).getTime();
      const key = monthKey(date);
      const count =
        key === currentMonthKey
          ? memberMemberships.filter((member: any) =>
              assignedPlanUserIds.has(member.userId),
            ).length
          : memberMemberships.filter((member: any) => {
              const joinedAt = member.joinedAt ?? member.createdAt;
              const status = normalize(member.status);
              const inactiveSince =
                status === "inactive" ? (member.updatedAt ?? null) : null;

              return (
                typeof joinedAt === "number" &&
                joinedAt <= endAt &&
                (typeof inactiveSince !== "number" || inactiveSince >= startAt)
              );
            }).length;

      return { key, label: monthLabel(date), count };
    });
  }, [assignedPlanUserIds, memberMemberships]);

  const activeMembers = memberMemberships.filter((member: any) =>
    assignedPlanUserIds.has(member.userId),
  ).length;
  const previousMonthMembers =
    monthlyMembers[monthlyMembers.length - 2]?.count ?? activeMembers;
  const memberDelta = activeMembers - previousMonthMembers;
  const memberDeltaPct =
    previousMonthMembers > 0 ? Math.round((memberDelta / previousMonthMembers) * 100) : 0;

  const upcomingClasses = useMemo(() => {
    if (!schedules || !classes) return [];
    const horizon = now + UPCOMING_WINDOW_MS;
    return schedules
      .filter(
        (schedule: any) =>
          schedule.startTime >= now &&
          schedule.startTime <= horizon &&
          schedule.status !== "cancelled",
      )
      .map((schedule: any) => ({
        ...schedule,
        class: classes.find((item: any) => item._id === schedule.classId),
      }))
      .sort((a: any, b: any) => a.startTime - b.startTime);
  }, [classes, now, schedules]);

  const nextClass = upcomingClasses[0];
  const selectedOverview = paymentMetrics?.selectedOverview;
  const pendingPayments =
    (selectedOverview?.pendingPayments ?? 0) +
    (selectedOverview?.inReviewPayments ?? 0);
  const netResult = selectedOverview?.netResultArs ?? 0;
  const collectionRate = selectedOverview?.collectionRatePct ?? 0;
  const financeChart = useMemo(() => {
    const periods = paymentMetrics?.monthlyOverview ?? [];
    return [...periods]
      .slice(0, 6)
      .reverse()
      .map((period: any) => ({
        key: period.billingPeriod,
        label: shortPeriodLabel(period.billingPeriod),
        value: period.netResultArs ?? 0,
      }));
  }, [paymentMetrics?.monthlyOverview]);

  const maxMemberCount = Math.max(
    ...monthlyMembers.map((month) => month.count),
    1,
  );
  const maxFinanceAbs = Math.max(
    ...financeChart.map((period) => Math.abs(period.value)),
    1,
  );
  const surfaceColor = isDark ? "#000000" : "#f0f0f1";
  const cardColor = isDark ? "#141416" : "#ffffff";
  const panelColor = isDark ? "#0f1012" : "#ffffff";
  const elevatedColor = isDark ? "#1f2024" : "#f4f4f5";
  const chartColor = isDark ? "#181a20" : "#f4f4f5";
  const chartBorderColor = isDark ? "#2d2f36" : "#e4e4e7";
  const textColor = isDark ? Colors.dark.text : Colors.light.text;
  const subtleColor = isDark ? Colors.dark.subtle : Colors.light.subtle;
  const displayName =
    convexUser?.nickname?.trim() ||
    user?.firstName ||
    user?.fullName?.split(" ").filter(Boolean)[0] ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "staff";

  return (
    <ThemedView style={[styles.container, { backgroundColor: surfaceColor }]}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.greetingRow}>
          <View>
            <ThemedText style={styles.greeting}>¡Hola {displayName}!</ThemedText>
            <ThemedText style={[styles.greetingMeta, { color: subtleColor }]}>
              {membership?.organization?.name ?? "Resumen general"}
            </ThemedText>
          </View>
          <ThemedPressable
            style={[
              styles.profileButton,
              {
                backgroundColor: cardColor,
                borderColor: chartBorderColor,
              },
            ]}
            onPress={() => router.push("/(tabs)/more/profile" as any)}
          >
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.profileImage} />
            ) : (
              <MaterialIcons name="person" size={24} color={textColor} />
            )}
          </ThemedPressable>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <View style={styles.metricLine}>
              <ThemedText style={styles.heroNumber}>{activeMembers}</ThemedText>
              <View style={[styles.trendPill, { backgroundColor: cardColor }]}>
                <MaterialIcons
                  name={memberDelta >= 0 ? "arrow-upward" : "arrow-downward"}
                  size={16}
                  color={memberDelta >= 0 ? "#10b981" : "#ef4444"}
                />
                <ThemedText style={styles.trendText}>
                  {Math.abs(memberDeltaPct)}% mes
                </ThemedText>
              </View>
            </View>
            <ThemedText style={styles.heroLabel}>Miembros activos</ThemedText>
            <ThemedText style={[styles.heroMeta, { color: subtleColor }]}>
              {membership?.organization?.name ?? "Resumen general"}
            </ThemedText>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionScroller}
        >
          <ActionCard
            title="Revisar pagos"
            description={`${pendingPayments} pendientes`}
            label="PAGOS"
            icon="payments"
            onPress={() => router.push("/(tabs)/more/payments" as any)}
            isDark={isDark}
          />
          <ActionCard
            title="Próximas clases"
            description={
              nextClass?.class?.name
                ? `${nextClass.class.name} es la siguiente`
                : "Sin clases esta semana"
            }
            label="AGENDA"
            icon="event"
            onPress={() => router.push("/(tabs)/classes" as any)}
            disabled={!showClasses}
            isDark={isDark}
          />
          <ActionCard
            title="Métricas"
            description="Entrenamiento y finanzas"
            label="ANALISIS"
            icon="bar-chart"
            onPress={() => router.push("/(tabs)/more/metrics" as any)}
            isDark={isDark}
          />
        </ScrollView>

        <View
          style={[
            styles.statsPanel,
            {
              backgroundColor: panelColor,
              borderColor: chartBorderColor,
            },
          ]}
        >
          <View style={styles.panelHeaderRow}>
            <View>
              <ThemedText type="defaultSemiBold" style={styles.panelTitle}>
                Estadísticas
              </ThemedText>
              <ThemedText style={[styles.panelMeta, { color: subtleColor }]}>
                Mes actual y últimos 6 meses
              </ThemedText>
            </View>
            <ThemedPressable
              style={[
                styles.metricsButton,
                {
                  backgroundColor: elevatedColor,
                  borderColor: chartBorderColor,
                },
              ]}
              onPress={() => router.push("/(tabs)/more/metrics" as any)}
            >
              <ThemedText style={styles.metricsButtonText}>Ver</ThemedText>
              <MaterialIcons name="arrow-forward" size={16} color={textColor} />
            </ThemedPressable>
          </View>

          <View style={styles.summaryGrid}>
            <StatSummaryCard
              icon="groups"
              label="Activos"
              value={`${activeMembers}`}
              detail={`${memberDelta >= 0 ? "+" : ""}${memberDelta} mes`}
              tone={memberDelta >= 0 ? "#10b981" : "#ef4444"}
              borderColor={chartBorderColor}
              backgroundColor={elevatedColor}
              textColor={textColor}
              subtleColor={subtleColor}
            />
            <StatSummaryCard
              icon="trending-up"
              label="Cobranza"
              value={showFinance ? formatPercent(collectionRate) : "-"}
              tone="#2563eb"
              detail={`${pendingPayments} pendientes`}
              borderColor={chartBorderColor}
              backgroundColor={elevatedColor}
              textColor={textColor}
              subtleColor={subtleColor}
            />
            <StatSummaryCard
              icon="account-balance-wallet"
              label="Balance"
              value={showFinance ? formatCompactCurrency(netResult) : "-"}
              tone={netResult < 0 ? "#ef4444" : "#10b981"}
              detail="Mes actual"
              borderColor={chartBorderColor}
              backgroundColor={elevatedColor}
              textColor={textColor}
              subtleColor={subtleColor}
            />
          </View>

          <View
            style={[
              styles.chartGrid,
              {
                backgroundColor: chartColor,
                borderColor: chartBorderColor,
              },
            ]}
          >
            <View style={styles.chartHeader}>
              <View>
                <ThemedText style={styles.chartTitle}>Miembros con plan</ThemedText>
                <ThemedText style={[styles.chartMeta, { color: subtleColor }]}>
                  Evolución mensual
                </ThemedText>
              </View>
              <View
                style={[
                  styles.chartPill,
                  {
                    backgroundColor: elevatedColor,
                    borderColor: chartBorderColor,
                  },
                ]}
              >
                <ThemedText style={styles.chartPillText}>{activeMembers}</ThemedText>
              </View>
            </View>
            <View style={styles.barGrid}>
              {monthlyMembers.map((month) => {
                const height = Math.max(
                  (month.count / maxMemberCount) * 58,
                  month.count > 0 ? 12 : 5,
                );

                return (
                  <View key={month.key} style={styles.barColumn}>
                    <ThemedText
                      style={[
                        styles.barValue,
                        { color: isDark ? "#f8fafc" : "#111" },
                      ]}
                    >
                      {month.count}
                    </ThemedText>
                    <View
                      style={[
                        styles.memberBar,
                        {
                          height,
                          backgroundColor: isDark ? "#60a5fa" : "#111",
                        },
                      ]}
                    />
                    <ThemedText style={[styles.barLabel, { color: subtleColor }]}>
                      {month.label}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          {showFinance ? (
            <View
              style={[
                styles.financeBars,
                {
                  backgroundColor: isDark ? "#111827" : "#eef2ff",
                  borderColor: chartBorderColor,
                },
              ]}
            >
              {financeChart.length === 0 ? (
                <ThemedText style={[styles.emptyChartText, { color: subtleColor }]}>
                  Todavía no hay períodos suficientes para graficar el balance.
                </ThemedText>
              ) : (
                <>
                  <View style={styles.financeHeader}>
                    <View>
                      <ThemedText style={styles.chartTitle}>Balance mensual</ThemedText>
                      <ThemedText style={[styles.chartMeta, { color: subtleColor }]}>
                        Ingresos menos gastos
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={[
                        styles.financeTotal,
                        { color: netResult < 0 ? "#ef4444" : "#10b981" },
                      ]}
                    >
                      {formatCompactCurrency(netResult)}
                    </ThemedText>
                  </View>
                  <View style={styles.financeBarGrid}>
                    {financeChart.map((period, index) => {
                      const height = Math.max(
                        (Math.abs(period.value) / maxFinanceAbs) * 48,
                        8,
                      );
                      const positive = period.value >= 0;

                      return (
                        <View
                          key={`${period.key}-${index}`}
                          style={styles.financeColumn}
                        >
                          <View
                            style={[
                              styles.financeBar,
                              {
                                height,
                                backgroundColor: positive ? "#10b981" : "#f87171",
                              },
                            ]}
                          />
                          <ThemedText
                            style={[styles.financeLabel, { color: subtleColor }]}
                          >
                            {period.label}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          ) : null}
        </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ActionCard({
  title,
  description,
  label,
  icon,
  onPress,
  disabled,
  isDark,
}: {
  title: string;
  description: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  isDark: boolean;
}) {
  const backgroundColor = isDark ? "#111113" : "#f4f4f5";
  const borderColor = isDark ? "#27272a" : "#d4d4d8";
  const foregroundColor = isDark ? "#f4f4f5" : "#111";
  const iconBackgroundColor = isDark ? "#1f2024" : "#fff";
  const arrowBackgroundColor = isDark ? "#f4f4f5" : "#111";
  const arrowColor = isDark ? "#111" : "#fff";

  return (
    <ThemedPressable
      style={[
        styles.actionCard,
        {
          backgroundColor,
          borderColor,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={[styles.actionIcon, { backgroundColor: iconBackgroundColor }]}>
        <MaterialIcons name={icon} size={24} color={foregroundColor} />
      </View>
      <View style={styles.actionText}>
        <ThemedText style={[styles.actionTitle, { color: foregroundColor }]}>
          {title}
        </ThemedText>
        <ThemedText
          style={[
            styles.actionDescription,
            { color: isDark ? "#d4d4d8" : "#111" },
          ]}
        >
          {description}
        </ThemedText>
      </View>
      <View style={styles.actionFooter}>
        <ThemedText style={[styles.actionLabel, { color: foregroundColor }]}>
          {label}
        </ThemedText>
        <View style={[styles.actionArrow, { backgroundColor: arrowBackgroundColor }]}>
          <MaterialIcons name="arrow-forward" size={24} color={arrowColor} />
        </View>
      </View>
    </ThemedPressable>
  );
}

function StatSummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
  borderColor,
  backgroundColor,
  textColor,
  subtleColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  detail: string;
  tone: string;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  subtleColor: string;
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor, borderColor }]}>
      <View style={styles.summaryHeader}>
        <ThemedText style={[styles.summaryLabel, { color: subtleColor }]}>
          {label}
        </ThemedText>
        <MaterialIcons name={icon} size={17} color={tone} />
      </View>
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.summaryValue, { color: textColor }]}
      >
        {value}
      </ThemedText>
      <ThemedText numberOfLines={1} style={[styles.summaryDetail, { color: tone }]}>
        {detail}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
    gap: 20,
  },
  greetingRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
  },
  greetingMeta: {
    marginTop: 2,
    fontSize: 14,
  },
  profileButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroCopy: { flex: 1 },
  metricLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroNumber: {
    fontSize: 76,
    lineHeight: 82,
    fontWeight: "800",
    letterSpacing: 0,
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  trendText: { fontSize: 15, fontWeight: "700" },
  heroLabel: { fontSize: 21, fontWeight: "700" },
  heroMeta: { marginTop: 4, fontSize: 14 },
  actionScroller: { gap: 16, paddingRight: 20 },
  actionCard: {
    width: 238,
    minHeight: 220,
    borderRadius: 30,
    borderWidth: 1,
    padding: 24,
    overflow: "hidden",
  },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { marginTop: 42 },
  actionTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  actionDescription: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  actionFooter: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionLabel: { fontSize: 12, fontWeight: "700" },
  actionArrow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  statsPanel: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitle: { fontSize: 22, lineHeight: 27 },
  panelMeta: { fontSize: 12 },
  metricsButton: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingLeft: 13,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricsButtonText: { fontSize: 13, fontWeight: "700" },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    minHeight: 96,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  summaryLabel: { fontSize: 11, fontWeight: "700" },
  summaryValue: {
    marginTop: 12,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "800",
  },
  summaryDetail: { marginTop: 3, fontSize: 11, fontWeight: "700" },
  chartGrid: {
    minHeight: 150,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  chartTitle: { fontSize: 14, fontWeight: "800" },
  chartMeta: { marginTop: 2, fontSize: 11 },
  chartPill: {
    minWidth: 36,
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  chartPillText: { fontSize: 13, fontWeight: "800" },
  barGrid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  barColumn: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  barValue: {
    color: "#111",
    fontSize: 11,
    fontWeight: "700",
  },
  memberBar: {
    width: 8,
    borderRadius: 6,
  },
  barLabel: { fontSize: 10, textTransform: "capitalize" },
  financeBars: {
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  financeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  financeTotal: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  financeBarGrid: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  financeColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  financeBar: {
    width: "100%",
    maxWidth: 24,
    borderRadius: 7,
  },
  financeLabel: { fontSize: 9, textTransform: "capitalize" },
  emptyChartText: {
    flex: 1,
    alignSelf: "center",
    textAlign: "center",
    fontSize: 12,
  },
});
