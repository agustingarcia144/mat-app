import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 400;
const PAN_ACTIVE_OFFSET_X = 25;
const SLIDE_OUT_DISTANCE = 320;
const WHEEL_DURATION_MS = 220;
const EXPAND_DURATION_MS = 280;

const ROW_HEIGHT = 62;

const WEEK_STARTS_MONDAY = { weekStartsOn: 1 as const };

/** Short day names (Mon–Sun) in Spanish, for use as column labels */
const SHORT_DAY_NAMES = (() => {
  const monday = new Date(2024, 0, 1); // 2024-01-01 is Monday
  return [0, 1, 2, 3, 4, 5, 6].map((i) =>
    format(addDays(monday, i), "EEE", { locale: es }),
  );
})();

type CalendarDay = { date: Date; ymd: string; inMonth: boolean };

type CalendarWeekViewProps = {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onWeekChange: (date: Date) => void;
  weekSessions?: {
    performedOn: string;
    status: string;
  }[];
  /** YMD strings (yyyy-MM-dd) for days that have a scheduled workout within the active assignment's date range */
  daysWithWorkouts?: string[];
  /** YMD strings (yyyy-MM-dd) for days that have at least one reserved class */
  daysWithClasses?: string[];
  /** YMD strings (yyyy-MM-dd) for days that have at least one attended class */
  daysWithAttendedClasses?: string[];
  /** When true, the component renders without its own card background so a
   * parent container can provide it (e.g. a unified header section). */
  transparentBackground?: boolean;
};

export function CalendarWeekView({
  selectedDate,
  onDateSelect,
  onWeekChange,
  weekSessions,
  daysWithWorkouts,
  daysWithClasses,
  daysWithAttendedClasses,
  transparentBackground = false,
}: CalendarWeekViewProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [expanded, setExpanded] = useState(false);

  // Full month grid (leading/trailing days included so every row has 7 cells)
  const monthWeeks = useMemo(() => {
    const gridStart = startOfWeek(
      startOfMonth(selectedDate),
      WEEK_STARTS_MONDAY,
    );
    const gridEnd = endOfWeek(endOfMonth(selectedDate), WEEK_STARTS_MONDAY);
    const weeks: CalendarDay[][] = [];
    let cursor = gridStart;
    while (cursor <= gridEnd) {
      const days: CalendarDay[] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(cursor, i);
        days.push({
          date,
          ymd: format(date, "yyyy-MM-dd"),
          inMonth: isSameMonth(date, selectedDate),
        });
      }
      weeks.push(days);
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }, [selectedDate]);

  const selectedYmd = format(selectedDate, "yyyy-MM-dd");

  const selectedWeekIndex = useMemo(() => {
    const idx = monthWeeks.findIndex((week) =>
      week.some((d) => d.ymd === selectedYmd),
    );
    return idx < 0 ? 0 : idx;
  }, [monthWeeks, selectedYmd]);

  const completedForDay = (ymd: string) => {
    const completedWorkout =
      weekSessions?.some(
        (s) => s.performedOn === ymd && s.status === "completed",
      ) ?? false;
    const completedClass = daysWithAttendedClasses?.includes(ymd) ?? false;
    return completedWorkout || completedClass;
  };

  const inProgressForDay = (ymd: string) =>
    weekSessions?.some(
      (s) => s.performedOn === ymd && s.status === "started",
    ) ?? false;

  const hasScheduledWorkout = (ymd: string) =>
    daysWithWorkouts?.includes(ymd) ?? false;

  const hasClassOnDay = (ymd: string) =>
    daysWithClasses?.includes(ymd) ?? false;

  const handlePrevious = useCallback(() => {
    const newDate = new Date(selectedDate);
    if (expanded) {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    onWeekChange(newDate);
  }, [selectedDate, onWeekChange, expanded]);

  const handleNext = useCallback(() => {
    const newDate = new Date(selectedDate);
    if (expanded) {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    onWeekChange(newDate);
  }, [selectedDate, onWeekChange, expanded]);

  const dragX = useSharedValue(0);
  const expandProgress = useSharedValue(0);

  const expand = useCallback(() => {
    setExpanded(true);
    expandProgress.value = withTiming(1, { duration: EXPAND_DURATION_MS });
  }, [expandProgress]);

  const collapse = useCallback(() => {
    setExpanded(false);
    expandProgress.value = withTiming(0, { duration: EXPAND_DURATION_MS });
  }, [expandProgress]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
        .onUpdate((e) => {
          dragX.value = e.translationX;
        })
        .onEnd((e) => {
          const goPrev =
            e.translationX > SWIPE_THRESHOLD ||
            e.velocityX > VELOCITY_THRESHOLD;
          const goNext =
            e.translationX < -SWIPE_THRESHOLD ||
            e.velocityX < -VELOCITY_THRESHOLD;
          if (goPrev) {
            dragX.value = withTiming(
              SLIDE_OUT_DISTANCE,
              { duration: WHEEL_DURATION_MS },
              (finished) => {
                if (finished) {
                  scheduleOnRN(handlePrevious);
                  dragX.value = 0;
                }
              },
            );
          } else if (goNext) {
            dragX.value = withTiming(
              -SLIDE_OUT_DISTANCE,
              { duration: WHEEL_DURATION_MS },
              (finished) => {
                if (finished) {
                  scheduleOnRN(handleNext);
                  dragX.value = 0;
                }
              },
            );
          } else {
            dragX.value = withTiming(0, { duration: 180 });
          }
        }),
    [handlePrevious, handleNext, dragX],
  );

  // Vertical drag on the handle expands / collapses the calendar
  const handleGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-10, 10])
        .onEnd((e) => {
          if (e.translationY > 16 || e.velocityY > 300) {
            scheduleOnRN(expand);
          } else if (e.translationY < -16 || e.velocityY < -300) {
            scheduleOnRN(collapse);
          }
        }),
    [expand, collapse],
  );

  const containerStyle = useAnimatedStyle(() => {
    const totalHeight = monthWeeks.length * ROW_HEIGHT;
    return {
      height: ROW_HEIGHT + expandProgress.value * (totalHeight - ROW_HEIGHT),
    };
  });

  const gridStyle = useAnimatedStyle(() => {
    const collapseOffset =
      -(selectedWeekIndex * ROW_HEIGHT) * (1 - expandProgress.value);
    return {
      transform: [
        { translateX: dragX.value },
        { translateY: collapseOffset },
      ],
    };
  });

  const monthYearLabel = useMemo(() => {
    const str = selectedDate.toLocaleDateString("es", {
      month: "long",
      year: "numeric",
    });
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, [selectedDate]);

  const handleDayPress = useCallback(
    (date: Date) => {
      onDateSelect(date);
      if (expanded) collapse();
    },
    [onDateSelect, expanded, collapse],
  );

  return (
    <View
      style={[
        styles.wrapper,
        transparentBackground
          ? styles.wrapperEmbedded
          : {
              ...styles.wrapperCard,
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.03)",
            },
      ]}
    >
      <Text
        style={[styles.monthYear, { color: isDark ? "#fff" : "#000" }]}
        numberOfLines={1}
      >
        {monthYearLabel}
      </Text>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.gridChannel, containerStyle]}>
          <Animated.View style={gridStyle}>
            {monthWeeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map(({ date, ymd, inMonth }, ci) => {
                  const isSelected = selectedYmd === ymd;
                  const isToday = ymd === format(new Date(), "yyyy-MM-dd");
                  const hasCompleted = completedForDay(ymd);
                  const hasInProgress = inProgressForDay(ymd);
                  const hasWorkoutOrClass =
                    hasScheduledWorkout(ymd) || hasClassOnDay(ymd);

                  // Dot color: green completed, blue in progress, orange scheduled
                  let circleColor: string | null = null;
                  if (hasCompleted) {
                    circleColor = "#22c55e";
                  } else if (hasInProgress) {
                    circleColor = "#2563eb";
                  } else if (hasWorkoutOrClass) {
                    circleColor = "#f97316";
                  }

                  let backgroundColor = "transparent";
                  if (isSelected) {
                    backgroundColor = isDark ? "#fff" : "#000";
                  } else if (isToday) {
                    backgroundColor = isDark
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(0, 0, 0, 0.05)";
                  }

                  const textColor = isSelected
                    ? isDark
                      ? "#000"
                      : "#fff"
                    : isDark
                      ? "#fff"
                      : "#000";

                  const dimmed = !inMonth && !isSelected;

                  return (
                    <View key={ymd} style={styles.dayColumn}>
                      <ThemedPressable
                        style={[styles.dayCell, { backgroundColor }]}
                        onPress={() => handleDayPress(date)}
                      >
                        <Text
                          style={[
                            styles.dayCellLabel,
                            { color: textColor },
                            dimmed && styles.outOfMonth,
                          ]}
                        >
                          {SHORT_DAY_NAMES[ci]}
                        </Text>
                        <Text
                          style={[
                            styles.dayCellNum,
                            { color: textColor },
                            dimmed && styles.outOfMonth,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        <View style={styles.statusCircleSlot}>
                          {circleColor && (
                            <View
                              style={[
                                styles.statusCircle,
                                { backgroundColor: circleColor },
                              ]}
                            />
                          )}
                        </View>
                      </ThemedPressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <GestureDetector gesture={handleGesture}>
        <ThemedPressable
          onPress={() => (expanded ? collapse() : expand())}
          style={styles.handleHitArea}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Contraer calendario" : "Ver mes completo"}
        >
          <View
            style={[
              styles.handle,
              {
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.4)"
                  : "rgba(0, 0, 0, 0.3)",
              },
            ]}
          />
        </ThemedPressable>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingBottom: 4,
  },
  wrapperCard: {
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderRadius: 20,
  },
  wrapperEmbedded: {
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  monthYear: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
  gridChannel: {
    width: "100%",
    overflow: "hidden",
  },
  weekRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
  },
  dayColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCell: {
    width: 40,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellLabel: {
    fontSize: 11,
    fontWeight: "500",
    opacity: 0.9,
    lineHeight: 14,
  },
  dayCellNum: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 2,
  },
  outOfMonth: {
    opacity: 0.3,
  },
  statusCircleSlot: {
    height: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  statusCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  handleHitArea: {
    alignSelf: "center",
    paddingTop: 8,
    paddingBottom: 2,
    paddingHorizontal: 24,
  },
  handle: {
    width: 32,
    height: 5,
    borderRadius: 3,
  },
});
