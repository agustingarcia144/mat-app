import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { addDays, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrgSettings } from "@/hooks/use-org-settings";

type ViewMode = "calendar" | "list";

const DAYS_IN_WEEK = 7;

export default function ClassesListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const orgSettings = useOrgSettings();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState<ViewMode>("calendar");
  const [classFilter, setClassFilter] = useState<string>("all");

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate],
  );
  const weekDays = useMemo(
    () => Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const classes = useQuery(api.classes.getByOrganization, {
    activeOnly: false,
  });
  const schedules = useQuery(api.classSchedules.getByOrganizationAndDateRange, {
    startDate: weekStart.getTime(),
    endDate: weekEnd.getTime(),
    classId: classFilter === "all" ? undefined : (classFilter as never),
    includeReservationBreakdown: true,
  });

  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return [];
    return schedules
      .map((schedule: any) => ({
        ...schedule,
        class: classes.find(
          (classItem: any) => classItem._id === schedule.classId,
        ),
      }))
      .sort((a: any, b: any) => a.startTime - b.startTime);
  }, [schedules, classes]);

  const schedulesByDay = useMemo(() => {
    const grouped: any[][] = Array.from({ length: DAYS_IN_WEEK }, () => []);
    enrichedSchedules.forEach((schedule: any) => {
      const dayIndex = weekDays.findIndex((day) =>
        isSameDay(day, new Date(schedule.startTime)),
      );
      if (dayIndex !== -1) grouped[dayIndex].push(schedule);
    });
    return grouped;
  }, [enrichedSchedules, weekDays]);

  const goPrevious = () => setCurrentDate((d) => addDays(d, -7));
  const goNext = () => setCurrentDate((d) => addDays(d, 7));
  const goToday = () => setCurrentDate(new Date());

  const openActions = () => {
    const options = [
      "Muestra turnos disponibles",
      "Turnos fijos",
      "Crear turnos",
      "Nueva clase",
      "Cancelar",
    ];

    if (Platform.OS === "ios") {
      Alert.alert("Acciones", options.slice(0, -1).join("\n"));
    } else {
      Alert.alert(
        "Acciones",
        undefined,
        options.slice(0, -1).map((text) => ({ text })),
      );
    }
  };

  const borderColor = isDark ? Colors.dark.border : Colors.light.border;
  const mutedBg = isDark ? Colors.dark.muted : "#fff";
  const subtleColor = isDark ? Colors.dark.subtle : Colors.light.subtle;
  const textColor = isDark ? Colors.dark.text : Colors.light.text;
  const chipBg = isDark ? "#111113" : "#f8fafc";

  if (orgSettings && !orgSettings.classesEnabled) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <EmptyState
          title="Clases deshabilitadas"
          description="Tu organización no tiene esta funcionalidad activada."
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <ThemedPressable
              onPress={openActions}
              style={[styles.headerButton, { borderColor }]}
              accessibilityRole="button"
              accessibilityLabel="Acciones"
            >
              <MaterialIcons name="more-vert" size={22} color={textColor} />
            </ThemedPressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.segmented,
            {
              borderColor,
              backgroundColor: isDark ? "#111113" : Colors.light.muted,
            },
          ]}
        >
          <SegmentButton
            label="Calendario"
            icon="calendar-today"
            selected={selectedView === "calendar"}
            onPress={() => setSelectedView("calendar")}
            isDark={isDark}
          />
          <SegmentButton
            label="Clases"
            icon="list"
            selected={selectedView === "list"}
            onPress={() => setSelectedView("list")}
            isDark={isDark}
          />
        </View>

        {selectedView === "calendar" ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContent}
            >
              <FilterChip
                label="Todas las clases"
                selected={classFilter === "all"}
                onPress={() => setClassFilter("all")}
                isDark={isDark}
              />
              {(classes ?? []).map((classItem: any) => (
                <FilterChip
                  key={classItem._id}
                  label={classItem.name}
                  selected={classFilter === classItem._id}
                  onPress={() => setClassFilter(classItem._id)}
                  isDark={isDark}
                />
              ))}
            </ScrollView>

            <View
              style={[
                styles.calendarCard,
                { borderColor, backgroundColor: mutedBg },
              ]}
            >
              <View style={styles.weekHeader}>
                <View style={styles.weekControls}>
                  <NavButton
                    icon="chevron-left"
                    onPress={goPrevious}
                    isDark={isDark}
                  />
                  <ThemedPressable
                    onPress={goToday}
                    style={[styles.todayButton, { borderColor }]}
                  >
                    <ThemedText style={styles.todayText}>Hoy</ThemedText>
                  </ThemedPressable>
                  <NavButton
                    icon="chevron-right"
                    onPress={goNext}
                    isDark={isDark}
                  />
                </View>
                <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
                  {format(weekStart, "d", { locale: es })} -{" "}
                  {format(addDays(weekStart, 6), "d 'de' MMMM yyyy", {
                    locale: es,
                  })}
                </ThemedText>
              </View>

              {schedules === undefined || classes === undefined ? (
                <View style={styles.loadingBlock}>
                  <ActivityIndicator color={textColor} />
                </View>
              ) : (
                <View style={styles.daysList}>
                  {weekDays.map((day, index) => {
                    const daySchedules = schedulesByDay[index] ?? [];
                    const today = isSameDay(day, new Date());

                    return (
                      <View
                        key={day.toISOString()}
                        style={[
                          styles.daySection,
                          {
                            borderColor: today ? "#22c55e" : borderColor,
                            backgroundColor: isDark
                              ? Colors.dark.background
                              : "#fff",
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.dayHeader,
                            {
                              borderBottomColor: borderColor,
                              backgroundColor: today
                                ? isDark
                                  ? "rgba(34,197,94,0.10)"
                                  : "#f0fdf4"
                                : "transparent",
                            },
                          ]}
                        >
                          <View>
                            <ThemedText
                              type="defaultSemiBold"
                              style={styles.dayName}
                            >
                              {format(day, "EEEE", { locale: es })}
                            </ThemedText>
                            <ThemedText
                              style={[styles.dayDate, { color: subtleColor }]}
                            >
                              {format(day, "d 'de' MMMM", { locale: es })}
                            </ThemedText>
                          </View>
                          {today ? (
                            <View
                              style={[
                                styles.todayBadge,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(34,197,94,0.20)"
                                    : "#dcfce7",
                                },
                              ]}
                            >
                              <ThemedText
                                style={[
                                  styles.todayBadgeText,
                                  { color: isDark ? "#86efac" : "#166534" },
                                ]}
                              >
                                Hoy
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.dayBody}>
                          {daySchedules.length === 0 ? (
                            <ThemedText
                              style={[styles.emptyDay, { color: subtleColor }]}
                            >
                              Sin turnos
                            </ThemedText>
                          ) : (
                            daySchedules.map((schedule: any) => (
                              <ScheduleCard
                                key={schedule._id}
                                schedule={schedule}
                                onPress={() =>
                                  router.push({
                                    pathname: "/(tabs)/classes/[scheduleId]",
                                    params: { scheduleId: schedule._id },
                                  })
                                }
                                isDark={isDark}
                              />
                            ))
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <Legend isDark={isDark} />
            </View>
          </>
        ) : (
          <View
            style={[
              styles.calendarCard,
              { borderColor, backgroundColor: mutedBg },
            ]}
          >
            {classes === undefined ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={textColor} />
              </View>
            ) : classes.length === 0 ? (
              <EmptyState
                title="No hay clases creadas"
                description="Crea tu primera clase para comenzar a gestionar horarios y reservas."
                imageSize={96}
              />
            ) : (
              <View style={styles.classList}>
                {classes.map((classItem: any) => (
                  <ClassRow
                    key={classItem._id}
                    classItem={classItem}
                    isDark={isDark}
                    chipBg={chipBg}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function SegmentButton({
  label,
  icon,
  selected,
  onPress,
  isDark,
}: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.segmentButton,
        selected && {
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={16}
        color={isDark ? Colors.dark.text : Colors.light.text}
      />
      <ThemedText type="defaultSemiBold" style={styles.segmentText}>
        {label}
      </ThemedText>
    </ThemedPressable>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
  isDark,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          borderColor: selected
            ? isDark
              ? Colors.dark.text
              : Colors.light.text
            : isDark
              ? Colors.dark.border
              : Colors.light.border,
          backgroundColor: selected
            ? isDark
              ? Colors.dark.text
              : Colors.light.text
            : isDark
              ? Colors.dark.muted
              : "#fff",
        },
      ]}
    >
      <ThemedText
        style={[
          styles.filterText,
          selected && { color: isDark ? Colors.dark.background : "#fff" },
        ]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </ThemedPressable>
  );
}

function NavButton({
  icon,
  onPress,
  isDark,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.navButton,
        { borderColor: isDark ? Colors.dark.border : Colors.light.border },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={20}
        color={isDark ? Colors.dark.text : Colors.light.text}
      />
    </ThemedPressable>
  );
}

function ScheduleCard({
  schedule,
  onPress,
  isDark,
}: {
  schedule: any;
  onPress: () => void;
  isDark: boolean;
}) {
  const start = new Date(schedule.startTime);
  const end = new Date(schedule.endTime);
  const status = getScheduleStatus(schedule);
  const fixedSlot = schedule.reservationBreakdown?.fixedSlot ?? 0;
  const regular =
    schedule.reservationBreakdown?.regular ??
    Math.max(0, (schedule.currentReservations ?? 0) - fixedSlot);

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.scheduleCard,
        { borderColor: isDark ? Colors.dark.border : Colors.light.border },
      ]}
    >
      <View style={styles.scheduleTop}>
        <View style={styles.scheduleTitleBlock}>
          <ThemedText
            type="defaultSemiBold"
            style={styles.scheduleTitle}
            numberOfLines={1}
          >
            {schedule.class?.name ?? "Clase"}
          </ThemedText>
          <ThemedText
            style={[
              styles.scheduleTime,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
          >
            {format(start, "HH:mm")} - {format(end, "HH:mm")}
          </ThemedText>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
              backgroundColor: isDark ? "#111113" : "#fff",
            },
          ]}
        >
          <ThemedText style={styles.statusText}>{status.label}</ThemedText>
        </View>
      </View>

      <View style={styles.reservationLine}>
        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
        <ThemedText
          style={[
            styles.reservationText,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          {schedule.currentReservations ?? 0}/{schedule.capacity ?? 0}{" "}
          reservados
        </ThemedText>
      </View>

      <View style={styles.breakdownLine}>
        <BreakdownItem
          icon="repeat"
          value={fixedSlot}
          label="fijas"
          isDark={isDark}
        />
        <BreakdownItem
          icon="person-add"
          value={regular}
          label="regulares"
          isDark={isDark}
        />
      </View>
    </ThemedPressable>
  );
}

function BreakdownItem({
  icon,
  value,
  label,
  isDark,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  value: number;
  label: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.breakdownItem}>
      <MaterialIcons
        name={icon}
        size={14}
        color={isDark ? Colors.dark.subtle : Colors.light.subtle}
      />
      <ThemedText
        style={[
          styles.breakdownText,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {value} {label}
      </ThemedText>
    </View>
  );
}

function ClassRow({
  classItem,
  isDark,
  chipBg,
}: {
  classItem: any;
  isDark: boolean;
  chipBg: string;
}) {
  return (
    <View
      style={[
        styles.classRow,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.background : "#fff",
        },
      ]}
    >
      <View style={styles.classIcon}>
        <MaterialIcons
          name="event-note"
          size={20}
          color={isDark ? Colors.dark.text : Colors.light.text}
        />
      </View>
      <View style={styles.classInfo}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {classItem.name}
        </ThemedText>
        {classItem.description ? (
          <ThemedText
            style={[
              styles.classMeta,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
            numberOfLines={2}
          >
            {classItem.description}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.classBadge, { backgroundColor: chipBg }]}>
        <ThemedText style={styles.classBadgeText}>
          {classItem.active === false ? "Inactiva" : "Activa"}
        </ThemedText>
      </View>
    </View>
  );
}

function Legend({ isDark }: { isDark: boolean }) {
  const items = [
    { label: "Disponible", color: "#22c55e" },
    { label: "Pocos cupos", color: "#f97316" },
    { label: "Completo", color: "#ef4444" },
    { label: "Cancelada", color: "#9ca3af" },
  ];

  return (
    <View style={styles.legend}>
      <ThemedText
        style={[
          styles.legendLabel,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        Estado:
      </ThemedText>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <ThemedText style={styles.legendText}>{item.label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function getScheduleStatus(schedule: any) {
  if (schedule.status === "cancelled") {
    return { label: "Cancelada", color: "#9ca3af" };
  }
  if (schedule.status === "completed") {
    return { label: "Completada", color: "#9ca3af" };
  }
  if ((schedule.capacity ?? 0) <= 0) {
    return { label: "Completo", color: "#ef4444" };
  }

  const percentFull =
    ((schedule.currentReservations ?? 0) / (schedule.capacity ?? 1)) * 100;
  if (percentFull >= 100) return { label: "Completo", color: "#ef4444" };
  if (percentFull > 60) return { label: "Pocos cupos", color: "#f97316" };
  return { label: "Disponible", color: "#22c55e" };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderWidth: 1,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  segmentText: {
    fontSize: 13,
  },
  filterContent: {
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    maxWidth: 180,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  calendarCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 14,
  },
  weekHeader: {
    gap: 12,
  },
  weekControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  todayButton: {
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  todayText: {
    fontSize: 13,
    fontWeight: "600",
  },
  weekLabel: {
    fontSize: 16,
  },
  loadingBlock: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  daysList: {
    gap: 12,
  },
  daySection: {
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 10,
  },
  dayHeader: {
    minHeight: 58,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dayName: {
    fontSize: 14,
    textTransform: "capitalize",
  },
  dayDate: {
    marginTop: 2,
    fontSize: 12,
  },
  todayBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  todayBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dayBody: {
    padding: 12,
    gap: 8,
  },
  emptyDay: {
    fontSize: 14,
  },
  scheduleCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  scheduleTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  scheduleTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  scheduleTitle: {
    fontSize: 14,
  },
  scheduleTime: {
    marginTop: 3,
    fontSize: 12,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  reservationLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  reservationText: {
    fontSize: 12,
  },
  breakdownLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  breakdownText: {
    fontSize: 12,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  legendLabel: {
    fontSize: 13,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 12,
  },
  classList: {
    gap: 10,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  classIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  classInfo: {
    flex: 1,
    minWidth: 0,
  },
  classMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  classBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  classBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
