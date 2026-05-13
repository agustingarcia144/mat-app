import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function UpcomingClassesCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [now, setNow] = useState(() => Date.now());

  const schedules = useQuery(api.classSchedules.getUpcoming, { limit: 20 });
  const classes = useQuery(api.classes.getByOrganization, { activeOnly: true });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(() => {
    if (!schedules || !classes) return [];
    const horizon = now + UPCOMING_WINDOW_MS;
    return schedules
      .filter(
        (s: any) =>
          s.startTime >= now &&
          s.startTime <= horizon &&
          s.status !== "cancelled",
      )
      .map((s: any) => ({
        ...s,
        class: classes.find((c: any) => c._id === s.classId),
      }))
      .sort((a: any, b: any) => a.startTime - b.startTime)
      .slice(0, 3);
  }, [schedules, classes, now]);

  const formatTimeLeft = (startTime: number) => {
    const diff = startTime - now;
    if (diff <= 0) return "En curso";
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
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
          Próximas clases
        </ThemedText>
        <MaterialIcons
          name="event"
          size={20}
          color={isDark ? Colors.dark.icon : Colors.light.icon}
        />
      </View>

      {upcoming.length === 0 ? (
        <View style={styles.emptyBody}>
          <ThemedText
            style={[
              styles.empty,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
          >
            No hay clases en los próximos 7 días.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {upcoming.map((s: any) => {
            const start = new Date(s.startTime);
            return (
              <View
                key={s._id}
                style={[
                  styles.row,
                  {
                    borderColor: isDark
                      ? Colors.dark.border
                      : Colors.light.border,
                  },
                ]}
              >
                <View style={styles.rowMain}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {s.class?.name ?? "Clase"}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.rowMeta,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {format(start, "EEE d 'de' MMM HH:mm", { locale: es })}
                  </ThemedText>
                </View>
                <View style={styles.rowSide}>
                  <View
                    style={[
                      styles.capacityDot,
                      { backgroundColor: getCapacityColor(s) },
                    ]}
                  />
                  <ThemedText style={styles.rowMetaSmall}>
                    {s.currentReservations}/{s.capacity ?? 0}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.rowMetaSmall,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {formatTimeLeft(s.startTime)}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
  emptyBody: {
    paddingVertical: 16,
    alignItems: "center",
  },
  empty: {
    fontSize: 13,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  rowSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  capacityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowMetaSmall: {
    fontSize: 12,
  },
});
