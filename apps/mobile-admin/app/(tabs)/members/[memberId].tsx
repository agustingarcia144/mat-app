import React, { useMemo } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const PAYMENT_STATUS_COPY: Record<string, { label: string; tone: string }> = {
  approved: { label: "Aprobado", tone: "#22c55e" },
  pending: { label: "Pendiente", tone: "#f97316" },
  declined: { label: "Rechazado", tone: "#ef4444" },
};

export default function MemberDetailScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    { includeInactive: true },
  );
  const subscriptions = useQuery(
    api.memberPlanSubscriptions.getByOrganization,
    {},
  );
  const payments = useQuery(api.planPayments.getByOrganization, {});

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
      (a, b) =>
        (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
    )[0];
  }, [subscriptions, memberId]);

  const memberPayments = useMemo(() => {
    if (!payments) return [];
    return (payments as any[])
      .filter((p) => p.userId === memberId)
      .sort(
        (a, b) =>
          (b.updatedAt ?? b.createdAt ?? 0) -
          (a.updatedAt ?? a.createdAt ?? 0),
      )
      .slice(0, 12);
  }, [payments, memberId]);

  const isLoading =
    memberships === undefined ||
    subscriptions === undefined ||
    payments === undefined;

  const displayName =
    (membership as any)?.fullName ||
    [
      (membership as any)?.firstName,
      (membership as any)?.lastName,
    ]
      .filter(Boolean)
      .join(" ") ||
    (membership as any)?.email ||
    "Miembro";

  const screenTitle =
    typeof displayName === "string" && displayName.length > 0
      ? displayName
      : "Detalle";

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "Cargando..." }} />
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
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

  const memberStatus = (membership as any).status?.toLowerCase();
  const isActive = memberStatus === "active" || memberStatus === "activo";

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: screenTitle }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {(membership as any).imageUrl ? (
            <Image
              source={{ uri: (membership as any).imageUrl }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: isDark ? "#27272a" : "#e4e4e7" },
              ]}
            >
              <ThemedText style={styles.avatarText}>
                {displayName.slice(0, 2).toUpperCase()}
              </ThemedText>
            </View>
          )}
          <View style={styles.headerMain}>
            <ThemedText type="defaultSemiBold" style={styles.name}>
              {displayName}
            </ThemedText>
            <ThemedText
              style={[
                styles.email,
                { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
              ]}
            >
              {(membership as any).email ?? "Sin email"}
            </ThemedText>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: isActive
                    ? isDark
                      ? "rgba(34,197,94,0.22)"
                      : "#dcfce7"
                    : isDark
                      ? "rgba(239,68,68,0.22)"
                      : "#fee2e2",
                },
              ]}
            >
              <ThemedText
                style={[
                  styles.badgeText,
                  {
                    color: isActive
                      ? isDark
                        ? "#86efac"
                        : "#166534"
                      : isDark
                        ? "#fca5a5"
                        : "#991b1b",
                  },
                ]}
              >
                {isActive ? "Activo" : "Inactivo"}
              </ThemedText>
            </View>
          </View>
        </View>

        <Section title="Suscripción">
          {subscription ? (
            <>
              <Row
                label="Plan"
                value={subscription.plan?.name ?? "—"}
                isDark={isDark}
              />
              <Row
                label="Estado"
                value={subscription.status ?? "—"}
                isDark={isDark}
              />
              {subscription.startDate ? (
                <Row
                  label="Inicio"
                  value={format(
                    new Date(subscription.startDate),
                    "d 'de' MMM yyyy",
                    { locale: es },
                  )}
                  isDark={isDark}
                />
              ) : null}
            </>
          ) : (
            <ThemedText
              style={{
                color: isDark ? Colors.dark.subtle : Colors.light.subtle,
              }}
            >
              Sin plan asignado
            </ThemedText>
          )}
        </Section>

        <Section title="Historial de pagos">
          {memberPayments.length === 0 ? (
            <ThemedText
              style={{
                color: isDark ? Colors.dark.subtle : Colors.light.subtle,
              }}
            >
              Sin pagos registrados
            </ThemedText>
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
                  style={[
                    styles.paymentRow,
                    {
                      borderColor: isDark
                        ? Colors.dark.border
                        : Colors.light.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="defaultSemiBold">
                      {payment.billingPeriod ?? "Período sin definir"}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.paymentDate,
                        {
                          color: isDark
                            ? Colors.dark.subtle
                            : Colors.light.subtle,
                        },
                      ]}
                    >
                      {payment.amount != null
                        ? `$${Number(payment.amount).toLocaleString("es-AR")}`
                        : "Sin monto"}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.paymentStatus,
                      { backgroundColor: `${status.tone}22` },
                    ]}
                  >
                    <ThemedText
                      style={[styles.paymentStatusText, { color: status.tone }]}
                    >
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
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
        {title}
      </ThemedText>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.row}>
      <ThemedText
        style={[
          styles.rowLabel,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerMain: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 18,
  },
  email: {
    fontSize: 13,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    marginTop: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  section: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
  },
  sectionContent: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    gap: 12,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  paymentDate: {
    fontSize: 12,
    marginTop: 2,
  },
  paymentStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
