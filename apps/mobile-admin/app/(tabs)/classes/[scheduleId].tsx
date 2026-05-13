import React, { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const RESERVATION_STATUS_COPY: Record<string, { label: string; tone: string }> = {
  confirmed: { label: "Confirmada", tone: "#22c55e" },
  cancelled: { label: "Cancelada", tone: "#ef4444" },
  attended: { label: "Asistió", tone: "#3b82f6" },
  no_show: { label: "No asistió", tone: "#a3a3a3" },
};

export default function ScheduleDetailScreen() {
  const { scheduleId } = useLocalSearchParams<{ scheduleId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const schedule = useQuery(
    api.classSchedules.getScheduleWithDetails,
    scheduleId ? { id: scheduleId as never } : "skip",
  );
  const reservations = useQuery(
    api.classReservations.getByScheduleWithUsers,
    scheduleId ? { scheduleId: scheduleId as never } : "skip",
  );

  const sortedReservations = useMemo(() => {
    if (!reservations) return [];
    return [...(reservations as any[])].sort(
      (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    );
  }, [reservations]);

  if (schedule === undefined) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "Cargando..." }} />
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  if (schedule === null) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: "No encontrado" }} />
        <ThemedText type="defaultSemiBold">Turno no encontrado</ThemedText>
      </ThemedView>
    );
  }

  const start = new Date(schedule.startTime);
  const end = new Date(schedule.endTime);
  const className = schedule.class?.name ?? "Clase";
  const capacity = schedule.capacity ?? 0;
  const currentReservations = schedule.currentReservations ?? 0;
  const cancelled = schedule.status === "cancelled";

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: className }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            {
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
              backgroundColor: isDark ? Colors.dark.muted : "#fff",
            },
          ]}
        >
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
            {className}
            {cancelled ? " · Cancelada" : ""}
          </ThemedText>
          <ThemedText
            style={[
              styles.cardMeta,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
          >
            {format(start, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </ThemedText>
          <ThemedText style={styles.cardMeta}>
            {format(start, "HH:mm")} – {format(end, "HH:mm")}
          </ThemedText>
          <View style={styles.capacityRow}>
            <ThemedText type="defaultSemiBold">
              {currentReservations}/{capacity} reservas
            </ThemedText>
          </View>
        </View>

        <View
          style={[
            styles.card,
            {
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
              backgroundColor: isDark ? Colors.dark.muted : "#fff",
            },
          ]}
        >
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
            Reservas
          </ThemedText>
          {reservations === undefined ? (
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          ) : sortedReservations.length === 0 ? (
            <ThemedText
              style={{
                color: isDark ? Colors.dark.subtle : Colors.light.subtle,
              }}
            >
              Sin reservas todavía.
            </ThemedText>
          ) : (
            <View style={styles.reservationList}>
              {sortedReservations.map((r) => {
                const status =
                  RESERVATION_STATUS_COPY[r.status as string] ?? {
                    label: r.status ?? "—",
                    tone: "#737373",
                  };
                const name =
                  r.user?.fullName?.trim() ||
                  [r.user?.firstName, r.user?.lastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim() ||
                  r.user?.email ||
                  "Miembro";
                return (
                  <View
                    key={r._id}
                    style={[
                      styles.reservationRow,
                      {
                        borderColor: isDark
                          ? Colors.dark.border
                          : Colors.light.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText type="defaultSemiBold" numberOfLines={1}>
                        {name}
                      </ThemedText>
                      {r.user?.email ? (
                        <ThemedText
                          style={[
                            styles.reservationEmail,
                            {
                              color: isDark
                                ? Colors.dark.subtle
                                : Colors.light.subtle,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {r.user.email}
                        </ThemedText>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.reservationStatus,
                        { backgroundColor: `${status.tone}22` },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.reservationStatusText,
                          { color: status.tone },
                        ]}
                      >
                        {status.label}
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
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
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
  },
  capacityRow: {
    marginTop: 8,
  },
  reservationList: {
    gap: 8,
  },
  reservationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  reservationEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  reservationStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  reservationStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
