import React, { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const PAYMENT_STATUS_COPY: Record<string, { label: string; tone: string }> = {
  approved: { label: "Aprobado", tone: "#22c55e" },
  pending: { label: "Pendiente", tone: "#f97316" },
  declined: { label: "Rechazado", tone: "#ef4444" },
};

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function safeDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string" && value.includes("/")) {
    const [day, month, year] = value.split("/");
    const parsed = new Date(`${year}-${month}-${day}`);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value: any): string {
  const d = safeDate(value);
  if (!d) return "—";
  return format(d, "d 'de' MMM yyyy", { locale: es });
}

function computePlanStatus(assignment: any) {
  if (!assignment) return { status: "none" as const, daysLeft: null, daysExpired: null };
  const start = safeDate(assignment.startDate);
  const end = safeDate(assignment.endDate);
  const now = new Date();
  if (!start || !end) return { status: "not_started" as const, daysLeft: null, daysExpired: null };
  const diffDays = (from: Date, to: Date) =>
    Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  const daysLeft = Math.max(diffDays(now, end), 0);
  const daysExpired = end <= now ? Math.max(diffDays(end, now), 0) : null;
  if (end <= now) return { status: "expired" as const, daysLeft: 0, daysExpired };
  if (start > now) return { status: "not_started" as const, daysLeft, daysExpired: null };
  if (daysLeft <= 5) return { status: "expiring_soon" as const, daysLeft, daysExpired: null };
  return { status: "active" as const, daysLeft, daysExpired: null };
}

export default function MemberDetailScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [togglingStatus, setTogglingStatus] = useState(false);

  const setActive = useMutation(api.organizationMemberships.setMemberActive);
  const setInactive = useMutation(api.organizationMemberships.setMemberInactive);

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    { includeInactive: true },
  );
  const subscriptions = useQuery(api.memberPlanSubscriptions.getByOrganization, {});
  const payments = useQuery(api.planPayments.getByOrganization, {});
  const planAssignments = useQuery(
    api.planificationAssignments.getByUser,
    memberId ? { userId: memberId } : "skip",
  );
  const fixedSlots = useQuery(
    api.fixedClassSlots.listByUser,
    memberId ? { userId: memberId } : "skip",
  );

  const membership = useMemo(
    () => (memberships ?? []).find((m) => m.userId === memberId),
    [memberships, memberId],
  );

  const subscription = useMemo(() => {
    if (!subscriptions) return null;
    const userSubs = (subscriptions as any[]).filter(
      (s) => s.userId === memberId && s.status !== "cancelled",
    );
    if (userSubs.length === 0) return null;
    return userSubs.sort(
      (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
    )[0];
  }, [subscriptions, memberId]);

  const memberPayments = useMemo(() => {
    if (!payments) return [];
    return (payments as any[])
      .filter((p) => p.userId === memberId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
      .slice(0, 12);
  }, [payments, memberId]);

  const activeAssignment = useMemo(() => {
    if (!planAssignments) return null;
    const active = (planAssignments as any[]).filter((a) => a.status === "active");
    if (!active.length) return null;
    return active.sort(
      (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
    )[0];
  }, [planAssignments]);

  const planStatus = useMemo(() => computePlanStatus(activeAssignment), [activeAssignment]);

  const isLoading =
    memberships === undefined ||
    subscriptions === undefined ||
    payments === undefined;

  const displayName =
    (membership as any)?.fullName ||
    [(membership as any)?.firstName, (membership as any)?.lastName].filter(Boolean).join(" ") ||
    (membership as any)?.email ||
    "Miembro";

  const memberStatus = (membership as any)?.status?.toLowerCase();
  const isActive = memberStatus === "active" || memberStatus === "activo";

  // ── Execute status toggle directly ──
  const executeToggle = async () => {
    if (!memberId || togglingStatus) return;
    setTogglingStatus(true);
    try {
      if (isActive) {
        await setInactive({ userId: memberId });
      } else {
        await setActive({ userId: memberId });
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "No se pudo cambiar el estado.");
    } finally {
      setTogglingStatus(false);
    }
  };

  // ── Open options sheet — one step, selecting executes directly ──
  const openOptions = () => {
    const actionLabel = isActive ? "Desactivar miembro" : "Activar miembro";
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [actionLabel, "Cancelar"],
          destructiveButtonIndex: isActive ? 0 : undefined,
          cancelButtonIndex: 1,
        },
        (index) => {
          if (index === 0) executeToggle();
        },
      );
    } else {
      Alert.alert("Opciones", undefined, [
        {
          text: actionLabel,
          style: isActive ? "destructive" : "default",
          onPress: executeToggle,
        },
        { text: "Cancelar", style: "cancel" },
      ]);
    }
  };

  // ── Theme ──
  const borderColor = isDark ? Colors.dark.border : Colors.light.border;
  const mutedBg = isDark ? Colors.dark.muted : "#fff";
  const subtleColor = isDark ? Colors.dark.subtle : Colors.light.subtle;
  const textColor = isDark ? Colors.dark.text : Colors.light.text;

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "Cargando..." }} />
        <ActivityIndicator color={textColor} />
      </ThemedView>
    );
  }

  if (!membership) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "No encontrado" }} />
        <ThemedText type="defaultSemiBold">Miembro no encontrado</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: displayName,
          headerBackTitle: "",
          headerBackButtonDisplayMode: "minimal",
          headerRight: () => (
            <Pressable
              onPress={openOptions}
              style={styles.headerBtn}
              hitSlop={12}
            >
              {togglingStatus ? (
                <ActivityIndicator size="small" color={textColor} />
              ) : (
                <MaterialIcons name="more-vert" size={24} color={textColor} />
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Profile header ── */}
        <View style={styles.profileRow}>
          {(membership as any).imageUrl ? (
            <Image source={{ uri: (membership as any).imageUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: isDark ? "#27272a" : "#e4e4e7" }]}>
              <ThemedText style={styles.avatarText}>
                {displayName.slice(0, 2).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <View style={styles.profileInfo}>
            <ThemedText type="defaultSemiBold" style={styles.name}>
              {displayName}
            </ThemedText>
            <ThemedText style={[styles.email, { color: subtleColor }]}>
              {(membership as any).email ?? "Sin email"}
            </ThemedText>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isActive
                    ? isDark ? "rgba(34,197,94,0.22)" : "#dcfce7"
                    : isDark ? "rgba(239,68,68,0.22)" : "#fee2e2",
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.statusBadgeText,
                  { color: isActive ? (isDark ? "#86efac" : "#166534") : (isDark ? "#fca5a5" : "#991b1b") },
                ]}
              >
                {isActive ? "Activo" : "Inactivo"}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* ── Suscripción ── */}
        <Section title="Suscripción" borderColor={borderColor} bg={mutedBg}>
          {subscription ? (
            <>
              <Row label="Plan" value={subscription.plan?.name ?? "—"} subtleColor={subtleColor} />
              <Row label="Estado" value={subscription.status ?? "—"} subtleColor={subtleColor} />
              {subscription.startDate ? (
                <Row
                  label="Inicio"
                  value={format(new Date(subscription.startDate), "d 'de' MMM yyyy", { locale: es })}
                  subtleColor={subtleColor}
                />
              ) : null}
            </>
          ) : (
            <ThemedText style={{ color: subtleColor }}>Sin plan asignado</ThemedText>
          )}
        </Section>

        {/* ── Planificación ── */}
        <Section title="Planificación" borderColor={borderColor} bg={mutedBg}>
          {planAssignments === undefined ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : !activeAssignment ? (
            <ThemedText style={{ color: subtleColor }}>Sin planificación asignada</ThemedText>
          ) : (
            <View style={styles.planCard}>
              <View style={styles.planNameRow}>
                <ThemedText type="defaultSemiBold" style={styles.planName}>
                  {activeAssignment.planification?.name ?? "—"}
                </ThemedText>
                {activeAssignment.weeksCount != null && (
                  <ThemedText style={[styles.planMeta, { color: subtleColor }]}>
                    {activeAssignment.weeksCount} semanas
                  </ThemedText>
                )}
              </View>

              <View style={styles.planBadges}>
                <PlanStatusBadge status={planStatus.status} isDark={isDark} />
                {planStatus.daysLeft != null && planStatus.status !== "expired" && (
                  <View style={[styles.daysChip, { backgroundColor: isDark ? "#1f2023" : "#f4f4f5", borderColor }]}>
                    <ThemedText style={[styles.daysChipText, { color: textColor }]}>
                      {planStatus.daysLeft} días restantes
                    </ThemedText>
                  </View>
                )}
                {planStatus.status === "expired" && planStatus.daysExpired != null && (
                  <View style={[styles.daysChip, { backgroundColor: isDark ? "#1f2023" : "#f4f4f5", borderColor }]}>
                    <ThemedText style={[styles.daysChipText, { color: "#ef4444" }]}>
                      Vencida hace {planStatus.daysExpired}d
                    </ThemedText>
                  </View>
                )}
              </View>

              <View style={[styles.planDates, { borderColor }]}>
                {activeAssignment.startDate && (
                  <View style={styles.planDateCol}>
                    <ThemedText style={[styles.planDateLabel, { color: subtleColor }]}>Inicio</ThemedText>
                    <ThemedText style={styles.planDateValue}>{formatDate(activeAssignment.startDate)}</ThemedText>
                  </View>
                )}
                {activeAssignment.endDate && (
                  <View style={styles.planDateCol}>
                    <ThemedText style={[styles.planDateLabel, { color: subtleColor }]}>Fin</ThemedText>
                    <ThemedText style={styles.planDateValue}>{formatDate(activeAssignment.endDate)}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}
        </Section>

        {/* ── Turnos fijos ── */}
        <Section title="Turnos fijos" borderColor={borderColor} bg={mutedBg}>
          {fixedSlots === undefined ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : (fixedSlots as any[]).length === 0 ? (
            <ThemedText style={{ color: subtleColor }}>Sin turnos fijos asignados</ThemedText>
          ) : (
            <View style={styles.slotList}>
              <ThemedText style={[styles.slotCount, { color: subtleColor }]}>
                {(fixedSlots as any[]).length} turno{(fixedSlots as any[]).length !== 1 ? "s" : ""}
              </ThemedText>
              {(fixedSlots as any[]).map((slot: any) => (
                <View key={slot._id} style={[styles.slotRow, { borderColor }]}>
                  <View style={styles.slotInfo}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1}>
                      {slot.className ?? "Clase"}
                    </ThemedText>
                    <ThemedText style={[styles.slotMeta, { color: subtleColor }]}>
                      {DAY_LABELS[slot.dayOfWeek]} {minutesToTime(slot.startTimeMinutes)}
                    </ThemedText>
                  </View>
                  <MaterialIcons name="fitness-center" size={16} color={subtleColor} />
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* ── Historial de pagos ── */}
        <Section title="Historial de pagos" borderColor={borderColor} bg={mutedBg}>
          {memberPayments.length === 0 ? (
            <ThemedText style={{ color: subtleColor }}>Sin pagos registrados</ThemedText>
          ) : (
            memberPayments.map((payment) => {
              const status =
                PAYMENT_STATUS_COPY[(payment.status as string) ?? ""] ?? {
                  label: payment.status ?? "—",
                  tone: "#737373",
                };
              return (
                <View
                  key={payment._id}
                  style={[styles.paymentRow, { borderColor }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">
                      {payment.billingPeriod ?? "Período sin definir"}
                    </ThemedText>
                    <ThemedText style={[styles.paymentAmount, { color: subtleColor }]}>
                      {payment.amount != null
                        ? `$${Number(payment.amount).toLocaleString("es-AR")}`
                        : "Sin monto"}
                    </ThemedText>
                  </View>
                  <View style={[styles.paymentStatusChip, { backgroundColor: `${status.tone}22` }]}>
                    <ThemedText style={[styles.paymentStatusText, { color: status.tone }]}>
                      {status.label}
                    </ThemedText>
                  </View>
                </View>
              );
            })
          )}
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function PlanStatusBadge({
  status,
  isDark,
}: {
  status: "active" | "expiring_soon" | "expired" | "not_started" | "none";
  isDark: boolean;
}) {
  const config = {
    active: { label: "Activa", bg: isDark ? "rgba(34,197,94,0.22)" : "#dcfce7", color: isDark ? "#86efac" : "#166534" },
    expiring_soon: { label: "Por vencer", bg: isDark ? "rgba(234,179,8,0.22)" : "#fef9c3", color: isDark ? "#fde68a" : "#ca8a04" },
    expired: { label: "Vencida", bg: isDark ? "rgba(239,68,68,0.22)" : "#fee2e2", color: isDark ? "#fca5a5" : "#991b1b" },
    not_started: { label: "Sin iniciar", bg: isDark ? "rgba(107,114,128,0.22)" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#52525b" },
    none: { label: "Sin plan", bg: isDark ? "rgba(107,114,128,0.22)" : "#f4f4f5", color: isDark ? "#a1a1aa" : "#52525b" },
  }[status];

  return (
    <View style={[styles.statusChip, { backgroundColor: config.bg }]}>
      <ThemedText style={[styles.statusChipText, { color: config.color }]}>
        {config.label}
      </ThemedText>
    </View>
  );
}

function Section({
  title,
  children,
  borderColor,
  bg,
}: {
  title: string;
  children: React.ReactNode;
  borderColor: string;
  bg: string;
}) {
  return (
    <View style={[styles.section, { borderColor, backgroundColor: bg }]}>
      <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  subtleColor,
}: {
  label: string;
  value: string;
  subtleColor: string;
}) {
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.rowLabel, { color: subtleColor }]}>{label}</ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 16, paddingBottom: 48 },

  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  // Profile
  profileRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700" },
  profileInfo: { flex: 1, gap: 4 },
  name: { fontSize: 18 },
  email: { fontSize: 13 },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, marginTop: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: "600" },

  // Section
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 14 },
  sectionContent: { gap: 8 },

  // Row
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 12 },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 14, fontWeight: "500", flexShrink: 1, textAlign: "right" },

  // Plan card
  planCard: { gap: 12 },
  planNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  planName: { fontSize: 15, flex: 1 },
  planMeta: { fontSize: 12 },
  planBadges: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  statusChipText: { fontSize: 12, fontWeight: "600" },
  daysChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, borderWidth: 1 },
  daysChipText: { fontSize: 12, fontWeight: "600" },
  planDates: { flexDirection: "row", gap: 24, borderTopWidth: 1, paddingTop: 12 },
  planDateCol: { gap: 2 },
  planDateLabel: { fontSize: 11 },
  planDateValue: { fontSize: 13, fontWeight: "600" },

  // Fixed slots
  slotList: { gap: 8 },
  slotCount: { fontSize: 12, marginBottom: 2 },
  slotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  slotInfo: { flex: 1, gap: 2 },
  slotMeta: { fontSize: 12 },

  // Payments
  paymentRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  paymentAmount: { fontSize: 12, marginTop: 2 },
  paymentStatusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  paymentStatusText: { fontSize: 12, fontWeight: "600" },
});
