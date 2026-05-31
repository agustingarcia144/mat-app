import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useQueries, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { mapMembershipsToMembers } from "@repo/core/utils";
import { Stack, useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Circle } from "react-native-svg";

import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { isOrgAdminRole } from "@/lib/security/roles";

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLASSES_PAGE_SIZE = 2;

function normalize(value?: string) {
  return value?.toLowerCase().trim() ?? "";
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", { month: "short" }).format(date);
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
  if (abs >= 1_000_000) return `$${(rounded / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `$${Math.round(rounded / 1_000)} k`;
  return `$${rounded.toLocaleString("es-AR")}`;
}

function formatPercent(value?: number | null) {
  if (value == null) return "-";
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function shortPeriodLabel(period?: string) {
  if (!period) return "";
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return monthLabel(new Date(year, month - 1, 1));
}

function safeDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === "string" && value.includes("/")) {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(`${year}-${month}-${day}`);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function computePlanStatus(assignment: any) {
  if (!assignment) return { status: "none", daysLeft: null, daysExpired: null };
  const start = safeDate(assignment.startDate);
  const end = safeDate(assignment.endDate);
  const now = new Date();
  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  if (!start || !end) return { status: "not_started", daysLeft: null, daysExpired: null };
  const daysLeftRaw = diffDays(now, end);
  const daysLeft = Math.max(daysLeftRaw, 0);
  const daysExpiredRaw = diffDays(end, now);
  const daysExpired = end <= now ? Math.max(daysExpiredRaw, 0) : null;
  if (end <= now) return { status: "expired", daysLeft: 0, daysExpired };
  if (start > now) return { status: "not_started", daysLeft, daysExpired: null };
  if (daysLeft <= 5) return { status: "expiring_soon", daysLeft, daysExpired: null };
  return { status: "active", daysLeft, daysExpired: null };
}

function getDateTime(value: any, fallback: number) {
  return safeDate(value)?.getTime() ?? fallback;
}

function pickRelevantAssignment(assignments: any[] | undefined) {
  const activeAssignments = assignments?.filter((a: any) => a.status === "active") ?? [];
  if (activeAssignments.length === 0) return null;
  const withStatus = activeAssignments.map((a: any) => ({
    assignment: a,
    planStatus: computePlanStatus(a),
  }));
  const byNewestStart = (a: any, b: any) =>
    getDateTime(b.assignment.startDate, 0) - getDateTime(a.assignment.startDate, 0) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);
  const byNextStart = (a: any, b: any) =>
    getDateTime(a.assignment.startDate, Number.MAX_SAFE_INTEGER) -
      getDateTime(b.assignment.startDate, Number.MAX_SAFE_INTEGER) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);
  const byLatestEnd = (a: any, b: any) =>
    getDateTime(b.assignment.endDate, 0) - getDateTime(a.assignment.endDate, 0) ||
    (b.assignment.createdAt ?? 0) - (a.assignment.createdAt ?? 0);
  const current = withStatus
    .filter(({ planStatus }: any) => planStatus.status === "active" || planStatus.status === "expiring_soon")
    .sort(byNewestStart);
  if (current[0]) return current[0].assignment;
  const upcoming = withStatus
    .filter(({ planStatus }: any) => planStatus.status === "not_started")
    .sort(byNextStart);
  if (upcoming[0]) return upcoming[0].assignment;
  const expired = withStatus
    .filter(({ planStatus }: any) => planStatus.status === "expired")
    .sort(byLatestEnd);
  return expired[0]?.assignment ?? activeAssignments[0] ?? null;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [classPageIndex, setClassPageIndex] = useState(0);

  const membership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    {},
  );
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

  // ── Members ──
  const memberMemberships = useMemo(
    () => (memberships ?? []).filter((m: any) => normalize(m.role) === "member"),
    [memberships],
  );

  const assignedPlanUserIds = useMemo(
    () =>
      new Set(
        (subscriptions ?? [])
          .filter((s: any) => s.status !== "cancelled")
          .map((s: any) => s.userId),
      ),
    [subscriptions],
  );

  const monthlyMembers = useMemo(() => {
    const currentMonth = startOfDateMonth(new Date());
    const defaultStartMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5, 1);
    const currentMonthKey = monthKey(currentMonth);
    return Array.from({ length: 6 }, (_, i) => {
      const date = new Date(defaultStartMonth.getFullYear(), defaultStartMonth.getMonth() + i, 1);
      const startAt = date.getTime();
      const endAt = endOfMonth(date).getTime();
      const key = monthKey(date);
      const count =
        key === currentMonthKey
          ? memberMemberships.filter((m: any) => assignedPlanUserIds.has(m.userId)).length
          : memberMemberships.filter((m: any) => {
              const joinedAt = m.joinedAt ?? m.createdAt;
              const status = normalize(m.status);
              const inactiveSince = status === "inactive" ? (m.updatedAt ?? null) : null;
              return (
                typeof joinedAt === "number" &&
                joinedAt <= endAt &&
                (typeof inactiveSince !== "number" || inactiveSince >= startAt)
              );
            }).length;
      return { key, label: monthLabel(date), count };
    });
  }, [assignedPlanUserIds, memberMemberships]);

  const activeMembers = memberMemberships.filter((m: any) =>
    assignedPlanUserIds.has(m.userId),
  ).length;
  const maxMemberCount = Math.max(...monthlyMembers.map((m) => m.count), 1);

  // ── Finance ──
  const selectedOverview = paymentMetrics?.selectedOverview;
  const pendingPayments =
    (selectedOverview?.pendingPayments ?? 0) + (selectedOverview?.inReviewPayments ?? 0);
  const netResult = selectedOverview?.netResultArs ?? 0;
  const totalIncome = selectedOverview?.totalIncomeArs ?? 0;
  const totalExpense = selectedOverview?.expenseArs ?? 0;
  const collectionRate = selectedOverview?.collectionRatePct ?? 0;
  const expectedAmount = selectedOverview?.expectedAmountArs ?? 0;

  const financeChart = useMemo(() => {
    const periods = paymentMetrics?.monthlyOverview ?? [];
    const sliced = [...periods].slice(0, 6).reverse();
    const maxAbs = Math.max(...sliced.map((p: any) => Math.abs(p.netResultArs ?? 0)), 1);
    return sliced.map((p: any) => ({
      key: p.billingPeriod,
      label: shortPeriodLabel(p.billingPeriod),
      value: p.netResultArs ?? 0,
      heightPct: Math.max((Math.abs(p.netResultArs ?? 0) / maxAbs) * 100, 10),
    }));
  }, [paymentMetrics?.monthlyOverview]);

  // ── Planifications ──
  const members = useMemo(() => {
    if (!memberships) return [];
    return mapMembershipsToMembers(memberships as any).filter(
      (m: any) => normalize(m.role) === "member",
    );
  }, [memberships]);

  const planQueries = useMemo(() => {
    if (!members.length) return {};
    return Object.fromEntries(
      members.map((m: any) => [
        m.id,
        { query: api.planificationAssignments.getByUser, args: { userId: m.id } },
      ]),
    );
  }, [members]);

  const assignmentsByUser = useQueries(planQueries);

  const membersWithStatuses = useMemo(() => {
    if (!members.length) return [];
    return members.map((m: any) => {
      const res = assignmentsByUser[m.id];
      const assignments = res instanceof Error ? undefined : res;
      const activeAssignment = pickRelevantAssignment(assignments);
      const planStatus = computePlanStatus(activeAssignment);
      return { ...m, planStatus };
    });
  }, [members, assignmentsByUser]);

  const membersWithIssues = useMemo(
    () =>
      membersWithStatuses.filter(
        (m: any) =>
          m.planStatus.status === "none" ||
          m.planStatus.status === "expired" ||
          m.planStatus.status === "expiring_soon",
      ),
    [membersWithStatuses],
  );

  const planSummary = useMemo(() => {
    const total = membersWithStatuses.length;
    const assigned = membersWithStatuses.filter((m: any) => m.planStatus.status === "active").length;
    const expiringSoon = membersWithStatuses.filter((m: any) => m.planStatus.status === "expiring_soon").length;
    const expired = membersWithStatuses.filter((m: any) => m.planStatus.status === "expired").length;
    const unassigned = membersWithStatuses.filter(
      (m: any) => m.planStatus.status === "none" || m.planStatus.status === "not_started",
    ).length;
    const toP = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
    return {
      total, assigned, expiringSoon, expired, unassigned,
      assignedPct: toP(assigned), expiringSoonPct: toP(expiringSoon),
      expiredPct: toP(expired), unassignedPct: toP(unassigned),
    };
  }, [membersWithStatuses]);

  const planSegments = [
    { label: "Asignadas", pct: planSummary.assignedPct, color: "#22c55e" },
    { label: "Por vencer", pct: planSummary.expiringSoonPct, color: "#eab308" },
    { label: "Vencidas", pct: planSummary.expiredPct, color: "#ef4444" },
    { label: "Sin asignar", pct: planSummary.unassignedPct, color: "#6b7280" },
  ];

  // ── Classes ──
  const upcomingClasses = useMemo(() => {
    if (!schedules || !classes) return [];
    const horizon = now + UPCOMING_WINDOW_MS;
    return schedules
      .filter(
        (s: any) => s.startTime >= now && s.startTime <= horizon && s.status !== "cancelled",
      )
      .map((s: any) => ({
        ...s,
        class: classes.find((c: any) => c._id === s.classId),
      }))
      .sort((a: any, b: any) => a.startTime - b.startTime);
  }, [classes, now, schedules]);

  const totalClassPages = Math.max(1, Math.ceil(upcomingClasses.length / CLASSES_PAGE_SIZE));
  const currentClassPage = Math.min(classPageIndex, totalClassPages - 1);
  const visibleClasses = upcomingClasses.slice(
    currentClassPage * CLASSES_PAGE_SIZE,
    currentClassPage * CLASSES_PAGE_SIZE + CLASSES_PAGE_SIZE,
  );

  const formatTimeLeft = (startTime: number) => {
    const diff = startTime - now;
    if (diff <= 0) return "En curso";
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return hours > 0 ? `Empieza en ${hours}h ${minutes}m` : `Empieza en ${minutes}m`;
  };

  const getCapacityColor = (s: any) => {
    const capacity = s.capacity ?? 0;
    if (capacity <= 0) return "#737373";
    const pct = (s.currentReservations / capacity) * 100;
    if (pct >= 100) return "#ef4444";
    if (pct >= 80) return "#f97316";
    if (pct >= 50) return "#eab308";
    return "#22c55e";
  };

  // ── Theme colors ──
  const cardBg = isDark ? "#141416" : "#ffffff";
  const cardBorder = isDark ? "#27272a" : "#e4e4e7";
  const innerCardBg = isDark ? "#1a1a1e" : "#f9fafb";
  const subtleColor = isDark ? Colors.dark.subtle : Colors.light.subtle;
  const textColor = isDark ? Colors.dark.text : Colors.light.text;
  const surfaceBg = isDark ? "#000000" : "#f0f0f1";

  return (
    <ThemedView style={[styles.container, { backgroundColor: surfaceBg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ── Dashboard Header ── */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>Dashboard</ThemedText>
            <ThemedText style={[styles.headerSubtitle, { color: subtleColor }]}>
              Resumen general de la organización
            </ThemedText>
          </View>

          {/* ── Miembros activos ── */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                Miembros activos
              </ThemedText>
              <MaterialIcons name="bar-chart" size={20} color={subtleColor} />
            </View>
            <View style={styles.membersBody}>
              <View style={styles.membersLeft}>
                <ThemedText style={styles.membersBigNumber}>{activeMembers}</ThemedText>
                <View style={[styles.activeBadge, { borderColor: cardBorder }]}>
                  <MaterialIcons name="check-circle" size={16} color="#22c55e" />
                  <ThemedText style={styles.activeBadgeText}>Activos</ThemedText>
                </View>
              </View>
              <View style={[styles.membersChart, { backgroundColor: innerCardBg, borderColor: cardBorder }]}>
                {monthlyMembers.map((month) => {
                  const heightPct = Math.max(
                    (month.count / maxMemberCount) * 100,
                    month.count > 0 ? 16 : 8,
                  );
                  return (
                    <View key={month.key} style={styles.memberBarCol}>
                      <ThemedText style={[styles.memberBarValue, { color: textColor }]}>
                        {month.count}
                      </ThemedText>
                      <View style={styles.memberBarTrack}>
                        <View
                          style={[
                            styles.memberBar,
                            { height: `${heightPct}%`, backgroundColor: "#22c55e" },
                          ]}
                        />
                      </View>
                      <ThemedText style={[styles.memberBarLabel, { color: subtleColor }]}>
                        {month.label}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Balance Financiero ── */}
          {showFinance && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                  Balance Financiero
                </ThemedText>
                <ThemedPressable
                  style={styles.seeMoreLink}
                  onPress={() => router.push("/(tabs)/more/metrics/payments" as any)}
                >
                  <ThemedText style={[styles.seeMoreText, { color: subtleColor }]}>
                    Ver balance
                  </ThemedText>
                  <MaterialIcons name="arrow-forward" size={16} color={subtleColor} />
                </ThemedPressable>
              </View>

              <View style={styles.financeCards}>
                {/* Balance de cuentas */}
                <View style={[styles.financeSubCard, { borderColor: cardBorder, backgroundColor: isDark ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.05)" }]}>
                  <View style={styles.financeSubHeader}>
                    <ThemedText style={[styles.financeSubLabel, { color: subtleColor }]}>
                      Balance de cuentas
                    </ThemedText>
                    <MaterialIcons
                      name="account-balance-wallet"
                      size={16}
                      color={netResult < 0 ? "#ef4444" : "#10b981"}
                    />
                  </View>
                  <ThemedText
                    style={[
                      styles.financeSubValue,
                      { color: netResult < 0 ? "#ef4444" : "#10b981" },
                    ]}
                  >
                    {formatCompactCurrency(netResult)}
                  </ThemedText>
                  <ThemedText style={[styles.financeSubDetail, { color: subtleColor }]}>
                    {formatCompactCurrency(totalIncome)} - {formatCompactCurrency(totalExpense)}
                  </ThemedText>
                </View>

                {/* Cobranza */}
                <View style={[styles.financeSubCard, { borderColor: cardBorder, backgroundColor: innerCardBg }]}>
                  <View style={styles.financeSubHeader}>
                    <ThemedText style={[styles.financeSubLabel, { color: subtleColor }]}>
                      Cobranza
                    </ThemedText>
                    <MaterialIcons name="trending-up" size={16} color="#2563eb" />
                  </View>
                  <ThemedText style={styles.financeSubValue}>
                    {formatPercent(collectionRate)}
                  </ThemedText>
                  <ThemedText style={[styles.financeSubDetail, { color: subtleColor }]}>
                    Sobre {formatCompactCurrency(expectedAmount)}
                  </ThemedText>
                </View>

                {/* Pendientes */}
                <View style={[styles.financeSubCard, { borderColor: cardBorder, backgroundColor: isDark ? "rgba(245,158,11,0.06)" : "rgba(245,158,11,0.05)" }]}>
                  <View style={styles.financeSubHeader}>
                    <ThemedText style={[styles.financeSubLabel, { color: subtleColor }]}>
                      Pendientes
                    </ThemedText>
                    <MaterialIcons name="schedule" size={16} color="#d97706" />
                  </View>
                  <ThemedText style={[styles.financeSubValue, { color: "#d97706" }]}>
                    {pendingPayments}
                  </ThemedText>
                  <ThemedText style={[styles.financeSubDetail, { color: subtleColor }]}>
                    Pagos sin cerrar
                  </ThemedText>
                </View>
              </View>

              {/* Evolution chart */}
              {financeChart.length > 0 && (
                <View style={[styles.evolutionCard, { borderColor: cardBorder, backgroundColor: innerCardBg }]}>
                  <View style={styles.evolutionHeader}>
                    <View>
                      <ThemedText style={styles.evolutionTitle}>Evolucion del balance</ThemedText>
                      <ThemedText style={[styles.evolutionMeta, { color: subtleColor }]}>
                        Ultimos {financeChart.length} periodos
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.evolutionBars}>
                    {financeChart.map((period, i) => {
                      const barHeight = Math.max((period.heightPct / 100) * 48, 8);
                      return (
                        <View key={`${period.key}-${i}`} style={styles.evolutionCol}>
                          <View
                            style={[
                              styles.evolutionBar,
                              {
                                height: barHeight,
                                backgroundColor: period.value >= 0 ? "#10b981" : "#f87171",
                              },
                            ]}
                          />
                          <ThemedText style={[styles.evolutionLabel, { color: subtleColor }]}>
                            {period.label}
                          </ThemedText>
                          <ThemedText style={[styles.evolutionAmount, { color: subtleColor }]}>
                            {formatCompactCurrency(period.value)}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── Estado de Planificaciones ── */}
          {memberships && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                Estado de Planificaciones
              </ThemedText>

              <ThemedPressable
                style={[styles.seeMoreButton, { backgroundColor: innerCardBg, borderColor: cardBorder }]}
                onPress={() => router.push("/(tabs)/members" as any)}
              >
                <MaterialIcons name="fitness-center" size={16} color={textColor} />
                <ThemedText style={styles.seeMoreButtonText}>Ver mas +</ThemedText>
              </ThemedPressable>

              <View style={[styles.donutContainer, { borderColor: cardBorder, backgroundColor: innerCardBg }]}>
                <DonutChart
                  segments={planSegments}
                  centerLabel={`${planSummary.assignedPct}%`}
                  centerSubLabel="ACTIVAS"
                  size={96}
                  strokeWidth={12}
                  textColor={textColor}
                  subtleColor={subtleColor}
                />
                <View style={styles.donutLegend}>
                  {planSegments.map((seg) => (
                    <View key={seg.label} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                      <ThemedText style={[styles.legendText, { color: subtleColor }]}>
                        {seg.label}: {seg.pct}%
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>

              {membersWithIssues.length === 0 ? (
                <ThemedText style={[styles.planAllGood, { color: subtleColor }]}>
                  Todos tus miembros pueden entrenar!
                </ThemedText>
              ) : (
                <View style={styles.issuesList}>
                  {membersWithIssues.map((m: any) => (
                    <View key={m.id} style={[styles.issueRow, { borderColor: cardBorder }]}>
                      <ThemedText style={styles.issueName} numberOfLines={1}>
                        {m.fullName || m.name}
                      </ThemedText>
                      {m.planStatus.status === "none" && (
                        <ThemedText style={[styles.issueStatus, { color: subtleColor }]}>
                          Sin planificación
                        </ThemedText>
                      )}
                      {m.planStatus.status === "expired" && (
                        <View style={[styles.issueBadge, { backgroundColor: isDark ? "rgba(239,68,68,0.2)" : "#fee2e2", borderColor: isDark ? "rgba(239,68,68,0.4)" : "#fecaca" }]}>
                          <MaterialIcons name="cancel" size={14} color={isDark ? "#fca5a5" : "#dc2626"} />
                          <ThemedText style={[styles.issueBadgeText, { color: isDark ? "#fca5a5" : "#dc2626" }]}>
                            Vencida{m.planStatus.daysExpired != null ? ` (hace ${m.planStatus.daysExpired}d)` : ""}
                          </ThemedText>
                        </View>
                      )}
                      {m.planStatus.status === "expiring_soon" && (
                        <View style={[styles.issueBadge, { backgroundColor: isDark ? "rgba(234,179,8,0.2)" : "#fef9c3", borderColor: isDark ? "rgba(234,179,8,0.4)" : "#fde68a" }]}>
                          <MaterialIcons name="warning" size={14} color={isDark ? "#fde68a" : "#ca8a04"} />
                          <ThemedText style={[styles.issueBadgeText, { color: isDark ? "#fde68a" : "#ca8a04" }]}>
                            Por vencer{m.planStatus.daysLeft != null ? ` (${m.planStatus.daysLeft}d)` : ""}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── Próximas clases ── */}
          {showClasses && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.cardHeader}>
                <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
                  Proximas clases
                </ThemedText>
                <View style={styles.paginationButtons}>
                  <ThemedPressable
                    style={[styles.pageBtn, { backgroundColor: innerCardBg }]}
                    onPress={() => setClassPageIndex(Math.max(0, currentClassPage - 1))}
                    disabled={currentClassPage === 0}
                  >
                    <MaterialIcons
                      name="chevron-left"
                      size={20}
                      color={currentClassPage === 0 ? cardBorder : textColor}
                    />
                  </ThemedPressable>
                  <ThemedPressable
                    style={[styles.pageBtn, { backgroundColor: innerCardBg }]}
                    onPress={() => setClassPageIndex(Math.min(totalClassPages - 1, currentClassPage + 1))}
                    disabled={currentClassPage >= totalClassPages - 1}
                  >
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color={currentClassPage >= totalClassPages - 1 ? cardBorder : textColor}
                    />
                  </ThemedPressable>
                </View>
              </View>

              {visibleClasses.length === 0 ? (
                <ThemedText style={[styles.emptyClasses, { color: subtleColor }]}>
                  No hay clases programadas en los proximos 7 dias.
                </ThemedText>
              ) : (
                <View style={styles.classesList}>
                  {visibleClasses.map((s: any) => {
                    const start = new Date(s.startTime);
                    const end = new Date(s.endTime);
                    return (
                      <View key={s._id} style={[styles.classCard, { borderColor: cardBorder }]}>
                        <View style={styles.classInfo}>
                          <ThemedText type="defaultSemiBold" numberOfLines={1}>
                            {s.class?.name ?? "Clase"}
                          </ThemedText>
                          <ThemedText style={[styles.classMeta, { color: subtleColor }]}>
                            {format(start, "EEEE d 'de' MMMM", { locale: es })}
                          </ThemedText>
                          <ThemedText style={styles.classTime}>
                            {format(start, "HH:mm")} - {format(end, "HH:mm")}
                          </ThemedText>
                        </View>
                        <View style={styles.classTimeLeft}>
                          <MaterialIcons name="schedule" size={16} color={textColor} />
                          <ThemedText style={styles.classTimeLeftText}>
                            {formatTimeLeft(s.startTime)}
                          </ThemedText>
                        </View>
                        <View style={styles.classFooter}>
                          <ThemedPressable
                            style={[styles.classDetailBtn, { backgroundColor: isDark ? "#fafafa" : "#111" }]}
                            onPress={() => router.push(`/(tabs)/classes/${s._id}` as any)}
                          >
                            <ThemedText style={[styles.classDetailBtnText, { color: isDark ? "#111" : "#fff" }]}>
                              Ver detalle
                            </ThemedText>
                          </ThemedPressable>
                          <View style={styles.classCapacity}>
                            <View style={[styles.capacityDot, { backgroundColor: getCapacityColor(s) }]} />
                            <ThemedText style={styles.capacityText}>
                              {s.currentReservations}/{s.capacity ?? 0}
                            </ThemedText>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DonutChart({
  segments,
  centerLabel,
  centerSubLabel,
  size,
  strokeWidth,
  textColor,
  subtleColor,
}: {
  segments: { label: string; pct: number; color: string }[];
  centerLabel: string;
  centerSubLabel: string;
  size: number;
  strokeWidth: number;
  textColor: string;
  subtleColor: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let accumulated = 0;

  const validSegments = segments.filter((s) => s.pct > 0);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        {validSegments.length === 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="rgba(107,114,128,0.18)"
            strokeWidth={strokeWidth}
            fill="none"
          />
        ) : (
          validSegments.map((seg) => {
            const segLen = (seg.pct / 100) * circumference;
            const offset = circumference - segLen;
            const rotation = (accumulated / 100) * 360 - 90;
            accumulated += seg.pct;
            return (
              <Circle
                key={seg.label}
                cx={center}
                cy={center}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${segLen} ${circumference - segLen}`}
                strokeDashoffset={0}
                strokeLinecap="butt"
                rotation={rotation}
                origin={`${center}, ${center}`}
              />
            );
          })
        )}
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <ThemedText style={{ fontSize: 18, fontWeight: "800", color: textColor }}>
          {centerLabel}
        </ThemedText>
        <ThemedText style={{ fontSize: 8, letterSpacing: 1.5, color: subtleColor, textTransform: "uppercase" }}>
          {centerSubLabel}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120,
    gap: 16,
  },
  header: { gap: 2 },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  headerSubtitle: { fontSize: 14 },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: { fontSize: 18 },

  // Active members
  membersBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },
  membersLeft: {
    alignItems: "center",
    gap: 12,
  },
  membersBigNumber: {
    fontSize: 48,
    fontWeight: "700",
    lineHeight: 52,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeBadgeText: { fontSize: 13, fontWeight: "600" },
  membersChart: {
    flex: 1,
    height: 132,
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 14,
    gap: 4,
  },
  memberBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    height: "100%",
  },
  memberBarValue: { fontSize: 12, fontWeight: "700" },
  memberBarTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  memberBar: {
    width: "80%",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  memberBarLabel: { fontSize: 11, textTransform: "capitalize" },

  // Finance
  seeMoreLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeMoreText: { fontSize: 14 },
  financeCards: { gap: 10 },
  financeSubCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    minHeight: 100,
  },
  financeSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  financeSubLabel: { fontSize: 12 },
  financeSubValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "700",
  },
  financeSubDetail: {
    marginTop: "auto",
    paddingTop: 8,
    fontSize: 11,
  },
  evolutionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  evolutionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  evolutionTitle: { fontSize: 14, fontWeight: "600" },
  evolutionMeta: { fontSize: 11, marginTop: 2 },
  evolutionBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingTop: 8,
  },
  evolutionCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  evolutionBar: {
    width: "80%",
    maxWidth: 28,
    borderRadius: 6,
  },
  evolutionLabel: { fontSize: 10, textTransform: "capitalize" },
  evolutionAmount: { fontSize: 9 },

  // Planifications
  seeMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seeMoreButtonText: { fontSize: 13, fontWeight: "600" },
  donutContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  donutLegend: { gap: 6, width: "100%" },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: { fontSize: 14 },
  planAllGood: { fontSize: 14, textAlign: "center", paddingVertical: 12 },
  issuesList: { gap: 4 },
  issueRow: {
    flexDirection: "column",
    gap: 6,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  issueName: { fontSize: 14, fontWeight: "600" },
  issueStatus: { fontSize: 13 },
  issueBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  issueBadgeText: { fontSize: 12, fontWeight: "500" },

  // Classes
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pageBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyClasses: { fontSize: 14, textAlign: "center", paddingVertical: 16 },
  classesList: { gap: 12 },
  classCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    minHeight: 170,
    gap: 4,
  },
  classInfo: { gap: 2 },
  classMeta: { fontSize: 14 },
  classTime: { fontSize: 14 },
  classTimeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  classTimeLeftText: { fontSize: 14 },
  classFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
    paddingTop: 10,
  },
  classDetailBtn: {
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  classDetailBtnText: { fontSize: 14, fontWeight: "600" },
  classCapacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  capacityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  capacityText: { fontSize: 14 },
});
