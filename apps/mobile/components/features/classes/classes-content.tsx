import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  View,
  Text,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useAuth } from "@clerk/expo";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex";
import { format } from "date-fns";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSubscriptionGate } from "@/hooks/use-subscription-gate";
import { ThemedView } from "@/components/ui/themed-view";
import {
  ClassesListHeader,
  ClassesListRow,
  ClassesNextUpcomingCard,
  ClassesEmptyState,
  type NextUpcomingItem,
  type ClassRowData,
  type BookingState,
  type CancellationState,
  type CheckInState,
  type ListRowSchedule,
  type ListRowClass,
  type ListRowReservation,
} from "@/components/features/classes";

const TAB_PADDING = 4;
const TAB_GAP = 4;

type TabId = "upcoming" | "past";

function AnimatedClassesTabs({
  activeTab,
  onTabChange,
  isDark,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isDark: boolean;
}) {
  const containerWidth = useSharedValue(0);
  const activeIndex = useSharedValue(activeTab === "upcoming" ? 0 : 1);

  useEffect(() => {
    activeIndex.value = withSpring(activeTab === "upcoming" ? 0 : 1, {
      damping: 42,
      stiffness: 260,
    });
  }, [activeTab, activeIndex]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      containerWidth.value = w;
    },
    [containerWidth],
  );

  const pillAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    const width = containerWidth.value;
    if (width <= 0) return { opacity: 0 };
    const pillWidth = (width - TAB_PADDING * 2 - TAB_GAP) / 2;
    const translateX = activeIndex.value * (pillWidth + TAB_GAP);
    return {
      width: pillWidth,
      transform: [{ translateX }],
      opacity: 1,
    };
  }, []);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.tabs,
        {
          backgroundColor: isDark ? "#171717" : "#f4f4f5",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
        },
      ]}
    >
      <Animated.View
        style={[
          styles.tabPill,
          {
            backgroundColor: isDark ? "#27272a" : "#ffffff",
          },
          pillAnimatedStyle,
        ]}
        pointerEvents="none"
      />
      <Pressable
        onPress={() => onTabChange("upcoming")}
        style={styles.tabButton}
      >
        <Text
          style={[
            styles.tabText,
            {
              color:
                activeTab === "upcoming"
                  ? isDark
                    ? "#fafafa"
                    : "#18181b"
                  : isDark
                    ? "#a1a1aa"
                    : "#71717a",
            },
          ]}
        >
          Proximas
        </Text>
      </Pressable>
      <Pressable onPress={() => onTabChange("past")} style={styles.tabButton}>
        <Text
          style={[
            styles.tabText,
            {
              color:
                activeTab === "past"
                  ? isDark
                    ? "#fafafa"
                    : "#18181b"
                  : isDark
                    ? "#a1a1aa"
                    : "#71717a",
            },
          ]}
        >
          Pasadas
        </Text>
      </Pressable>
    </View>
  );
}

export default function ClassesContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { userId } = useAuth();
  const { canAccess: hasActiveSubscription } = useSubscriptionGate();

  const classes = useQuery(api.classes.getByOrganization, { activeOnly: true });
  const schedules = useQuery(api.classSchedules.getUpcoming, { limit: 25 });
  const myUpcoming = useQuery(api.classReservations.getUpcomingByUser, {});
  const myInWindow = useQuery(
    api.classReservations.getReservationsInCheckInWindow,
    {},
  );
  const myPast = useQuery(api.classReservations.getPastByUser, {});
  const fixedSlots = useQuery(
    api.fixedClassSlots.listByUser,
    userId ? { userId } : "skip",
  );

  const reserve = useMutation(api.classReservations.reserve);
  const cancelReservation = useMutation(api.classReservations.cancel);
  const checkInSelf = useMutation(api.classReservations.checkInSelf);

  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);
  const [busyReservationId, setBusyReservationId] = useState<string | null>(
    null,
  );
  const [busyCheckInReservationId, setBusyCheckInReservationId] = useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [error, setError] = useState("");

  type ClassItem =
    NonNullable<typeof classes> extends readonly (infer C)[] ? C : never;
  type MyUpcomingItemElement =
    NonNullable<typeof myUpcoming> extends readonly (infer R)[] ? R : never;
  type MyPastItemElement =
    NonNullable<typeof myPast> extends readonly (infer R)[] ? R : never;
  type MyInWindowItemElement =
    NonNullable<typeof myInWindow> extends readonly (infer R)[] ? R : never;

  const activeClassById = useMemo(() => {
    const map = new Map<string, ClassItem>();
    classes?.forEach((c) => map.set(c._id, c));
    return map;
  }, [classes]);

  const reservationByScheduleId = useMemo(() => {
    const map = new Map<string, MyUpcomingItemElement>();
    myUpcoming?.forEach((r) => {
      if (r.schedule?._id) map.set(r.schedule._id, r);
    });
    return map;
  }, [myUpcoming]);

  const enrichedSchedules = useMemo(() => {
    if (!schedules || !classes) return [];

    return schedules
      .map((s) => {
        const classTemplate = activeClassById.get(s.classId);
        if (!classTemplate) return null;
        return { schedule: s, class: classTemplate };
      })
      .filter(Boolean) as {
      schedule: (typeof schedules)[number];
      class: (typeof classes)[number];
    }[];
  }, [activeClassById, classes, schedules]);

  type MyUpcomingItem = MyUpcomingItemElement;
  type MyPastItem = MyPastItemElement;
  type MyInWindowItem = MyInWindowItemElement;
  type EnrichedItem = (typeof enrichedSchedules)[number];
  type ReservationItem = MyUpcomingItem | MyPastItem | MyInWindowItem;
  type ListItem =
    | {
        type: "reservation";
        reservation: ReservationItem;
        schedule: NonNullable<ReservationItem["schedule"]>;
        class: NonNullable<ReservationItem["class"]>;
      }
    | {
        type: "schedule";
        schedule: EnrichedItem["schedule"];
        class: EnrichedItem["class"];
      };

  const upcomingListItemsByDate = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    const seenScheduleIds = new Set<string>();

    const add = (dateKey: string, item: ListItem) => {
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(item);
    };

    // Reservations in the check-in window (20 min before start → 6h after end):
    // show correct badge (Reservado / Asististe / No show) and actions
    myInWindow?.forEach((r) => {
      if (!r.schedule || !r.class) return;
      seenScheduleIds.add(r.schedule._id);
      const dateKey = format(new Date(r.schedule.startTime), "yyyy-MM-dd");
      add(dateKey, {
        type: "reservation",
        reservation: r,
        schedule: r.schedule,
        class: r.class,
      });
    });

    // Confirmed upcoming reservations (before check-in window opens) so we show
    // reservation row with Cancelar button instead of schedule row + check icon
    myUpcoming?.forEach((r) => {
      if (!r.schedule || !r.class) return;
      if (seenScheduleIds.has(r.schedule._id)) return;
      seenScheduleIds.add(r.schedule._id);
      const dateKey = format(new Date(r.schedule.startTime), "yyyy-MM-dd");
      add(dateKey, {
        type: "reservation",
        reservation: r,
        schedule: r.schedule,
        class: r.class,
      });
    });

    enrichedSchedules.forEach(({ schedule, class: classTemplate }) => {
      const dateKey = format(new Date(schedule.startTime), "yyyy-MM-dd");
      if (seenScheduleIds.has(schedule._id)) return;
      add(dateKey, { type: "schedule", schedule, class: classTemplate });
    });

    map.forEach((items) =>
      items.sort(
        (a, b) =>
          (a.type === "reservation"
            ? a.schedule.startTime
            : a.schedule.startTime) -
          (b.type === "reservation"
            ? b.schedule.startTime
            : b.schedule.startTime),
      ),
    );
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [myInWindow, myUpcoming, enrichedSchedules]);

  const pastListItemsByDate = useMemo(() => {
    const map = new Map<string, ListItem[]>();

    const add = (dateKey: string, item: ListItem) => {
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(item);
    };

    myPast?.forEach((r) => {
      if (!r.schedule || !r.class) return;
      const dateKey = format(new Date(r.schedule.startTime), "yyyy-MM-dd");
      add(dateKey, {
        type: "reservation",
        reservation: r,
        schedule: r.schedule,
        class: r.class,
      });
    });

    map.forEach((items) =>
      items.sort(
        (a, b) =>
          (b.type === "reservation"
            ? b.schedule.startTime
            : b.schedule.startTime) -
          (a.type === "reservation"
            ? a.schedule.startTime
            : a.schedule.startTime),
      ),
    );

    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [myPast]);

  type ClassRow = { dateKey: string; date: Date; item: ListItem };

  const buildRows = useCallback((entries: [string, ListItem][]): ClassRow[] => {
    const rows: ClassRow[] = [];
    entries.forEach(([dateKey, item]) => {
      const date = new Date(dateKey + "T12:00:00");
      rows.push({ dateKey, date, item });
    });
    return rows;
  }, []);

  const upcomingListData = useMemo((): ClassRow[] => {
    const rows: ClassRow[] = [];
    upcomingListItemsByDate.forEach(([dateKey, items]) => {
      const date = new Date(dateKey + "T12:00:00");
      items.forEach((item) => {
        rows.push({ dateKey, date, item });
      });
    });
    return rows;
  }, [upcomingListItemsByDate]);

  const pastListData = useMemo((): ClassRow[] => {
    const flat: [string, ListItem][] = [];
    pastListItemsByDate.forEach(([dateKey, items]) => {
      items.forEach((item) => flat.push([dateKey, item]));
    });
    return buildRows(flat);
  }, [buildRows, pastListItemsByDate]);

  const nextUpcoming = useMemo((): NextUpcomingItem | null => {
    if (myUpcoming?.length) {
      const r = myUpcoming[0];
      if (r?.schedule && r?.class)
        return {
          type: "reservation" as const,
          schedule: r.schedule,
          class: r.class,
        };
    }
    const first = enrichedSchedules[0];
    if (first)
      return {
        type: "schedule" as const,
        schedule: first.schedule,
        class: first.class,
      };
    return null;
  }, [myUpcoming, enrichedSchedules]);

  const getBookingState = useCallback(
    (args: {
      schedule: EnrichedItem["schedule"];
      classTemplate: EnrichedItem["class"];
    }) => {
      const { schedule, classTemplate } = args;
      const now = Date.now();

      const isFull = schedule.currentReservations >= schedule.capacity;
      const isCancelled = schedule.status !== "scheduled";
      const hasStarted = now >= schedule.startTime;

      const bookingWindowMs =
        classTemplate.bookingWindowDays * 24 * 60 * 60 * 1000;
      const earliestBookingTime = schedule.startTime - bookingWindowMs;
      const bookingNotOpenYet = now < earliestBookingTime;

      const isReserved = reservationByScheduleId.has(schedule._id);

      const canReserve =
        hasActiveSubscription &&
        !isReserved &&
        !isFull &&
        !isCancelled &&
        !hasStarted &&
        !bookingNotOpenYet;

      let helperText = "";
      if (!hasActiveSubscription) helperText = "Necesitás un plan activo";
      else if (isReserved) helperText = "Ya reservaste esta clase";
      else if (isCancelled) helperText = "Clase no disponible";
      else if (hasStarted) helperText = "La clase ya comenzó";
      else if (bookingNotOpenYet)
        helperText = `Reservas habilitadas ${classTemplate.bookingWindowDays} días antes`;
      else if (isFull) helperText = "Clase completa";

      return { canReserve, isReserved, helperText, isFull };
    },
    [reservationByScheduleId, hasActiveSubscription],
  );

  const getCancellationState = useCallback((r: ListRowReservation) => {
    const schedule = r.schedule;
    const classTemplate = r.class;
    if (!schedule || !classTemplate) {
      return { canCancel: false, helperText: "" };
    }
    if (r.status !== "confirmed") {
      return { canCancel: false, helperText: "" };
    }

    const nowMs = Date.now();
    const cancellationWindowMs =
      (classTemplate.cancellationWindowHours ?? 0) * 60 * 60 * 1000;
    const latestCancellationTime = schedule.startTime - cancellationWindowMs;
    const canCancel = nowMs <= latestCancellationTime;

    return {
      canCancel,
      helperText: canCancel
        ? ""
        : `Cancelación hasta ${classTemplate.cancellationWindowHours ?? 0} horas antes`,
    };
  }, []);

  const getCheckInState = useCallback((r: ListRowReservation) => {
    const schedule = r.schedule;
    if (!schedule) return { canCheckIn: false, helperText: "" };

    const nowMs = Date.now();
    const checkInOpensAt = schedule.startTime - 20 * 60 * 1000;
    const checkInClosesAt = schedule.endTime + 6 * 60 * 60 * 1000;
    const isConfirmed = r.status === "confirmed";
    const canCheckIn =
      isConfirmed && nowMs >= checkInOpensAt && nowMs <= checkInClosesAt;

    return {
      canCheckIn,
      helperText: canCheckIn
        ? ""
        : "Check-in disponible desde 20 min antes hasta 6 h después de finalizar",
    };
  }, []);

  const loading =
    classes === undefined ||
    schedules === undefined ||
    myUpcoming === undefined ||
    myInWindow === undefined ||
    myPast === undefined;

  const handleReserve = useCallback(
    (scheduleId: string) => {
      setError("");
      Alert.alert(
        "Reservar clase",
        "¿Querés reservar tu lugar en esta clase?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Sí, reservar",
            onPress: async () => {
              setBusyScheduleId(scheduleId);
              try {
                await reserve({ scheduleId: scheduleId as any });
              } catch (e: any) {
                const raw: string = e?.message ?? "";
                const match = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
                const friendly =
                  match?.[1]?.trim() ?? "No se pudo reservar la clase";
                Alert.alert("No se pudo reservar", friendly, [
                  { text: "Entendido" },
                ]);
              } finally {
                setBusyScheduleId(null);
              }
            },
          },
        ],
      );
    },
    [reserve],
  );

  const handleCancel = useCallback(
    async (reservationId: string) => {
      setError("");
      Alert.alert("Cancelar reserva", "¿Quieres cancelar tu reserva?", [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            setBusyReservationId(reservationId);
            try {
              await cancelReservation({ id: reservationId as any });
            } catch (e: any) {
              const raw: string = e?.message ?? "";
              const match = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
              const friendly =
                match?.[1]?.trim() ?? "No se pudo cancelar la reserva";
              Alert.alert("No se pudo cancelar", friendly, [
                { text: "Entendido" },
              ]);
            } finally {
              setBusyReservationId(null);
            }
          },
        },
      ]);
    },
    [cancelReservation],
  );

  const handleCheckIn = useCallback(
    (reservationId: string) => {
      setError("");
      Alert.alert(
        "Confirmar asistencia",
        "¿Querés confirmar tu asistencia a esta clase?",
        [
          { text: "No", style: "cancel" },
          {
            text: "Sí, confirmar",
            onPress: async () => {
              setBusyCheckInReservationId(reservationId);
              try {
                await checkInSelf({ id: reservationId as any });
              } catch (e: any) {
                const raw: string = e?.message ?? "";
                const match = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
                const friendly =
                  match?.[1]?.trim() ?? "No se pudo confirmar la asistencia";
                Alert.alert("No se pudo confirmar", friendly, [
                  { text: "Entendido" },
                ]);
              } finally {
                setBusyCheckInReservationId(null);
              }
            },
          },
        ],
      );
    },
    [checkInSelf],
  );

  const handlePressCard = useCallback(
    (scheduleId: string) => {
      router.push(`/classes/${scheduleId}` as Href);
    },
    [router],
  );

  const listHeader = useMemo(
    () => (
      <View>
        <ClassesListHeader
          insetsTop={insets.top}
          error={error}
          isDark={isDark}
        />
        <AnimatedClassesTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isDark={isDark}
        />
        {activeTab === "upcoming" && (
          <ClassesNextUpcomingCard
            nextUpcoming={nextUpcoming}
            isDark={isDark}
            onPressCard={handlePressCard}
          />
        )}
      </View>
    ),
    [insets.top, error, isDark, nextUpcoming, handlePressCard, activeTab],
  );

  const isFixedSlotMatch = useCallback(
    (classId: string, startTime: number) => {
      if (!fixedSlots?.length) return false;
      const d = new Date(startTime);
      const day = d.getUTCDay();
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      return fixedSlots.some(
        (s) =>
          s.classId === classId &&
          s.dayOfWeek === day &&
          s.startTimeMinutes === mins,
      );
    },
    [fixedSlots],
  );

  const renderListItem = useCallback(
    ({ item: row }: { item: ClassRow }) => {
      const isFixedSlot =
        row.item.type === "reservation" &&
        "classId" in row.item.reservation &&
        typeof (row.item.reservation as { classId?: string }).classId ===
          "string" &&
        isFixedSlotMatch(
          (row.item.reservation as { classId: string }).classId,
          row.item.schedule.startTime,
        );
      return (
        <ClassesListRow
          row={row as ClassRowData}
          isDark={isDark}
          colorScheme={colorScheme ?? null}
          busyScheduleId={busyScheduleId}
          busyReservationId={busyReservationId}
          getBookingState={
            getBookingState as (args: {
              schedule: ListRowSchedule;
              classTemplate: ListRowClass;
            }) => BookingState
          }
          getCancellationState={
            getCancellationState as (r: ListRowReservation) => CancellationState
          }
          getCheckInState={
            getCheckInState as (r: ListRowReservation) => CheckInState
          }
          onReserve={handleReserve}
          onCancel={handleCancel}
          onCheckIn={handleCheckIn}
          onPressCard={handlePressCard}
          hideReservationActions={activeTab === "past"}
          busyCheckInReservationId={busyCheckInReservationId}
          isFixedSlot={isFixedSlot}
        />
      );
    },
    [
      isDark,
      colorScheme,
      busyScheduleId,
      busyReservationId,
      getBookingState,
      getCancellationState,
      getCheckInState,
      handleReserve,
      handleCancel,
      handleCheckIn,
      handlePressCard,
      activeTab,
      busyCheckInReservationId,
      isFixedSlotMatch,
    ],
  );

  const keyExtractor = useCallback((item: ClassRow) => {
    const id =
      item.item.type === "reservation"
        ? item.item.reservation._id
        : item.item.schedule._id;
    return `${item.dateKey}-${id}`;
  }, []);

  const listEmpty = useMemo(
    () =>
      activeTab === "upcoming" ? (
        // Upcoming empty state is already shown by ClassesNextUpcomingCard in the header
        <View style={{ paddingBottom: insets.bottom + 40 }} />
      ) : (
        <ClassesEmptyState
          paddingBottom={insets.bottom + 40}
          title="No tienes clases pasadas"
          subtext="Aquí verás tus clases pasadas"
        />
      ),
    [insets.bottom, activeTab],
  );

  const listData = activeTab === "upcoming" ? upcomingListData : pastListData;

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlashList
        data={listData}
        renderItem={renderListItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
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
  },
  tabs: {
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: TAB_PADDING,
    flexDirection: "row",
    gap: TAB_GAP,
  },
  tabPill: {
    position: "absolute",
    left: TAB_PADDING,
    top: TAB_PADDING,
    bottom: TAB_PADDING,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
