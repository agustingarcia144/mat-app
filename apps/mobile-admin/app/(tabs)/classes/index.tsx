import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrgSettings } from "@/hooks/use-org-settings";

export default function ClassesListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const orgSettings = useOrgSettings();

  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );

  const classes = useQuery(api.classes.getByOrganization, {
    activeOnly: false,
  });
  const schedules = useQuery(api.classSchedules.getByOrganizationAndDateRange, {
    startDate: weekStart.getTime(),
    endDate: weekEnd.getTime(),
  });

  const enriched = useMemo(() => {
    if (!schedules || !classes) return [];
    return schedules
      .map((s: any) => ({
        ...s,
        class: classes.find((c: any) => c._id === s.classId),
      }))
      .sort((a: any, b: any) => a.startTime - b.startTime);
  }, [schedules, classes]);

  const goPrevious = () => setCurrentDate((d) => addDays(d, -7));
  const goNext = () => setCurrentDate((d) => addDays(d, 7));
  const goToday = () => setCurrentDate(new Date());

  if (orgSettings && !orgSettings.classesEnabled) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <View style={styles.safeFull}>
          <EmptyState
            title="Clases deshabilitadas"
            description="Tu organización no tiene esta funcionalidad activada."
          />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <ThemedText
          style={[
            styles.subtitle,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          Turnos de la semana
        </ThemedText>
        <View
          style={[
            styles.weekNav,
            {
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
              backgroundColor: isDark ? Colors.dark.muted : "#fff",
            },
          ]}
        >
          <ThemedPressable
            onPress={goPrevious}
            style={styles.navButton}
            type="default"
          >
            <MaterialIcons
              name="chevron-left"
              size={22}
              color={isDark ? "#fff" : "#000"}
            />
          </ThemedPressable>
          <View style={styles.weekLabelWrapper}>
            <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
              {format(weekStart, "d", { locale: es })} –{" "}
              {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                locale: es,
              })}
            </ThemedText>
            <ThemedPressable onPress={goToday} style={styles.todayButton}>
              <ThemedText
                style={[
                  styles.todayButtonText,
                  { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
                ]}
              >
                Hoy
              </ThemedText>
            </ThemedPressable>
          </View>
          <ThemedPressable
            onPress={goNext}
            style={styles.navButton}
            type="default"
          >
            <MaterialIcons
              name="chevron-right"
              size={22}
              color={isDark ? "#fff" : "#000"}
            />
          </ThemedPressable>
        </View>

        {schedules === undefined || classes === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : enriched.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title="Sin turnos esta semana"
              description="No hay clases programadas en este rango."
            />
          </View>
        ) : (
          <FlashList
            data={enriched}
            keyExtractor={(s: any) => s._id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
              <ScheduleRow
                schedule={item}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/classes/[scheduleId]",
                    params: { scheduleId: item._id },
                  })
                }
              />
            )}
          />
        )}
      </View>
    </ThemedView>
  );
}

function ScheduleRow({
  schedule,
  onPress,
}: {
  schedule: any;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const start = new Date(schedule.startTime);
  const end = new Date(schedule.endTime);
  const capacity = schedule.capacity ?? 0;
  const reservations = schedule.currentReservations ?? 0;
  const pct = capacity > 0 ? (reservations / capacity) * 100 : 0;
  const tone =
    pct >= 100 ? "#ef4444" : pct >= 80 ? "#f97316" : pct >= 50 ? "#eab308" : "#22c55e";
  const cancelled = schedule.status === "cancelled";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
          opacity: cancelled ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.rowMain}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {schedule.class?.name ?? "Clase"}
          {cancelled ? " · Cancelada" : ""}
        </ThemedText>
        <ThemedText
          style={[
            styles.rowMeta,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          {format(start, "EEE d 'de' MMM", { locale: es })} ·{" "}
          {format(start, "HH:mm")} – {format(end, "HH:mm")}
        </ThemedText>
      </View>
      <View style={styles.rowSide}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <ThemedText style={styles.rowMetaSmall}>
          {reservations}/{capacity}
        </ThemedText>
      </View>
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  safeFull: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 13,
  },
  weekNav: {
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabelWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  weekLabel: {
    fontSize: 14,
  },
  todayButton: {
    paddingVertical: 2,
  },
  todayButtonText: {
    fontSize: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 14,
  },
  rowMain: {
    flex: 1,
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowMetaSmall: {
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
