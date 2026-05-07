import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSubscriptionGate } from "@/hooks/use-subscription-gate";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { CalendarWeekView } from "@/components/features/home/calendar-week-view";
import { NoActivePlanAlert } from "@/components/features/home/no-active-plan-alert";
import { SubscriptionBanner } from "@/components/features/home/subscription-banner";
import { ReservedClassesForDay } from "@/components/features/home/reserved-classes-for-day";
import { RestDayPlaceholder } from "@/components/features/home/rest-day-placeholder";
import {
  AssignmentDayWorkout,
  useAssignmentScheduledDays,
} from "@/components/features/home/assignment-day-workout";
import { ScrollView } from "react-native-gesture-handler";

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const };

export default function DashboardContent() {
  const { user } = useUser();
  const convexUser = useQuery(api.users.getCurrentUser);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const { status: subscriptionStatus, canAccess: hasActiveSubscription } =
    useSubscriptionGate();

  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const assignments = useQuery(
    api.planificationAssignments.getByUser,
    user?.id ? { userId: user.id } : "skip",
  );

  const activeAssignments = useMemo(() => {
    const active = assignments?.filter((a) => a.status === "active") ?? [];
    if (active.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sort: assignments whose date range contains today come first
    return [...active].sort((a, b) => {
      const aInRange = isInDateRange(a, today);
      const bInRange = isInDateRange(b, today);
      if (aInRange && !bInRange) return -1;
      if (!aInRange && bInRange) return 1;
      return 0;
    });
  }, [assignments]);

  const organizationUsesPlanifications = useQuery(
    api.planificationAssignments.organizationUsesPlanifications,
    user?.id ? {} : "skip",
  );

  const showNoActivePlanAlert =
    activeAssignments.length === 0 &&
    organizationUsesPlanifications === true;

  const tabBarHeight = Platform.OS === "ios" ? 49 : 56;
  const alertTabGap = 12;
  const alertBottomOffset = insets.bottom + tabBarHeight + alertTabGap;
  const alertHeight = 110;

  const { monday, sunday } = useMemo(
    () => ({
      monday: startOfWeek(selectedDate, WEEK_STARTS_MONDAY),
      sunday: endOfWeek(selectedDate, WEEK_STARTS_MONDAY),
    }),
    [selectedDate],
  );

  const weekSessions = useQuery(
    api.workoutDaySessions.getMyWeekSessions,
    user?.id
      ? {
          startOn: format(monday, "yyyy-MM-dd"),
          endOn: format(sunday, "yyyy-MM-dd"),
        }
      : "skip",
  );

  const handleWeekChange = (newDate: Date) => {
    setSelectedDate(newDate);
  };

  // Show all sessions from active assignments + completed sessions from others
  const activeAssignmentIds = useMemo(
    () => new Set(activeAssignments.map((a) => a._id)),
    [activeAssignments],
  );
  const weekSessionsForDisplay = useMemo(
    () =>
      (weekSessions ?? []).filter(
        (s) =>
          activeAssignmentIds.has(s.assignmentId) ||
          s.status === "completed",
      ),
    [weekSessions, activeAssignmentIds],
  );

  // Calendar dots: aggregate scheduled days from up to 2 assignments.
  // Convex caches shared query subscriptions, so duplicates with
  // AssignmentDayWorkout are free. The hook returns [] for undefined.
  const scheduledDays0 = useAssignmentScheduledDays(
    activeAssignments[0],
    monday,
    selectedDate,
  );
  const scheduledDays1 = useAssignmentScheduledDays(
    activeAssignments[1],
    monday,
    selectedDate,
  );
  const daysWithScheduledWorkouts = useMemo(
    () => Array.from(new Set([...scheduledDays0, ...scheduledDays1])),
    [scheduledDays0, scheduledDays1],
  );

  const selectedYmd = format(selectedDate, "yyyy-MM-dd");

  const { startOfDay, endOfDay } = useMemo(() => {
    const d = new Date(selectedDate);
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { startOfDay: start.getTime(), endOfDay: end.getTime() };
  }, [selectedDate]);

  const { startOfWeekMs, endOfWeekMs } = useMemo(
    () => ({
      startOfWeekMs: monday.getTime(),
      endOfWeekMs: sunday.getTime(),
    }),
    [monday, sunday],
  );

  const reservationsForDay = useQuery(api.classReservations.getByUserForDate, {
    startOfDay,
    endOfDay,
  });

  const reservationsForWeek = useQuery(
    api.classReservations.getByUserForDateRange,
    { startOfRange: startOfWeekMs, endOfRange: endOfWeekMs },
  );

  const daysWithClasses = useMemo(
    () =>
      Array.from(
        new Set(
          (reservationsForWeek ?? [])
            .filter((r) => r.schedule != null)
            .map((r) => format(new Date(r.schedule!.startTime), "yyyy-MM-dd")),
        ),
      ),
    [reservationsForWeek],
  );

  const daysWithAttendedClasses = useMemo(
    () =>
      Array.from(
        new Set(
          (reservationsForWeek ?? [])
            .filter((r) => r.schedule != null && r.status === "attended")
            .map((r) => format(new Date(r.schedule!.startTime), "yyyy-MM-dd")),
        ),
      ),
    [reservationsForWeek],
  );

  const reservedClassesItems = useMemo(
    () =>
      reservationsForDay?.filter(
        (
          r,
        ): r is typeof r & {
          schedule: NonNullable<typeof r.schedule>;
          class: NonNullable<typeof r.class>;
        } => r.schedule != null && r.class != null,
      ) ?? [],
    [reservationsForDay],
  );

  const hasWorkoutOnSelected =
    daysWithScheduledWorkouts.includes(selectedYmd) ||
    weekSessionsForDisplay.some((s) => s.performedOn === selectedYmd);

  const todaySectionLoading =
    weekSessions === undefined || reservationsForDay === undefined;

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: showNoActivePlanAlert
              ? alertHeight + alertBottomOffset
              : 24,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.welcome}>
            ¡Hola,{" "}
            {convexUser?.nickname ||
              user?.firstName ||
              user?.emailAddresses[0]?.emailAddress}
            !
          </ThemedText>
          <ThemedPressable
            type="secondary"
            onPress={() => router.push("/profile" as Href)}
            style={styles.avatarButton}
            accessibilityLabel="Abrir perfil"
          >
            {user?.imageUrl ? (
              <Image
                source={{ uri: user.imageUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text
                style={[
                  styles.avatarPlaceholder,
                  { color: isDark ? "#a1a1aa" : "#52525b" },
                ]}
              >
                {(
                  user?.firstName?.[0] ||
                  user?.emailAddresses?.[0]?.emailAddress?.[0] ||
                  "?"
                ).toUpperCase()}
              </Text>
            )}
          </ThemedPressable>
        </View>

        <View
          style={[
            styles.calendarFullWidth,
            { width: windowWidth, marginLeft: -24 },
          ]}
        >
          <CalendarWeekView
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onWeekChange={handleWeekChange}
            weekSessions={weekSessionsForDisplay}
            daysWithWorkouts={daysWithScheduledWorkouts}
            daysWithClasses={daysWithClasses}
            daysWithAttendedClasses={daysWithAttendedClasses}
          />
        </View>

        <ScrollView contentContainerStyle={styles.todaySection}>
          {todaySectionLoading ? (
            <View style={[styles.todaySectionLoading, styles.centered]}>
              <ActivityIndicator
                size="large"
                color={isDark ? "#a1a1aa" : "#71717a"}
              />
              <Text
                style={[
                  styles.todaySectionLoadingText,
                  { color: isDark ? "#71717a" : "#a1a1aa" },
                ]}
              >
                Cargando...
              </Text>
            </View>
          ) : (
            <>
              {!hasActiveSubscription &&
                subscriptionStatus !== "loading" && (
                  <SubscriptionBanner
                    status={subscriptionStatus}
                    isDark={isDark}
                    onPress={() => router.push("/plan" as Href)}
                  />
                )}
              <View
                style={
                  !hasActiveSubscription ? { opacity: 0.5 } : undefined
                }
                pointerEvents={!hasActiveSubscription ? "none" : "auto"}
              >
                {activeAssignments.map((assignment) => (
                  <AssignmentDayWorkout
                    key={assignment._id}
                    assignment={assignment}
                    selectedDate={selectedDate}
                    weekSessions={weekSessionsForDisplay}
                    isDark={isDark}
                    hasActiveSubscription={hasActiveSubscription}
                    showPlanificationName={activeAssignments.length > 1}
                  />
                ))}
              </View>
              {reservedClassesItems.length > 0 && (
                <ReservedClassesForDay
                  reservations={reservedClassesItems}
                  isDark={isDark}
                  onPressSchedule={(scheduleId) =>
                    router.push(`/home/schedule/${scheduleId}` as Href)
                  }
                />
              )}
              {reservedClassesItems.length === 0 &&
                !hasWorkoutOnSelected && <RestDayPlaceholder />}
            </>
          )}
        </ScrollView>
      </View>
      {showNoActivePlanAlert && (
        <View
          style={[styles.alertOverlay, { bottom: alertBottomOffset }]}
          pointerEvents="box-none"
        >
          <NoActivePlanAlert
            onPress={() => router.push("/profile/planifications" as Href)}
            isDark={isDark}
          />
        </View>
      )}
    </ThemedView>
  );
}

function isInDateRange(
  a: { startDate?: number; endDate?: number },
  today: Date,
): boolean {
  const start = a.startDate ? new Date(a.startDate) : null;
  if (start) start.setHours(0, 0, 0, 0);
  const end = a.endDate ? new Date(a.endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);
  const afterStart = !start || today >= start;
  const beforeEnd = !end || today <= end;
  return afterStart && beforeEnd;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  alertOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  calendarFullWidth: {
    marginLeft: -24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  welcome: {
    flex: 1,
    marginTop: 8,
    marginBottom: 0,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    fontSize: 18,
    fontWeight: "600",
  },
  todaySection: {
    flex: 1,
    marginBottom: 20,
  },
  todaySectionLoading: {
    minHeight: 160,
    paddingVertical: 32,
  },
  todaySectionLoadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});
