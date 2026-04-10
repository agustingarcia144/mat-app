import React, { useState } from "react";
import { View, Text } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AssignmentDetailDayCard } from "./assignment-detail-day-card";
import { assignmentDetailStyles as styles } from "./assignment-detail-styles";
import { SPACING } from "./constants";
import type {
  WorkoutDay,
  DayExerciseWithDetails,
  ExerciseBlock,
} from "./types";
import { PressableScale } from "pressto";

interface AssignmentDetailWeekSectionProps {
  week: { _id: string; name: string };
  weekDays: WorkoutDay[];
  exercisesByDayId: Record<string, DayExerciseWithDetails[]>;
  blocksByDayId: Record<string, ExerciseBlock[]>;
  isDark: boolean;
  muted: string;
  cardBg: string;
  cardBorder: string;
  onExercisePress?: (ex: DayExerciseWithDetails) => void;
  /** Initial expanded state. Default true. */
  defaultExpanded?: boolean;
}

export function AssignmentDetailWeekSection({
  week,
  weekDays,
  exercisesByDayId,
  blocksByDayId,
  isDark,
  muted,
  cardBg,
  cardBorder,
  onExercisePress,
  defaultExpanded = true,
}: AssignmentDetailWeekSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const titleColor = isDark ? "#fafafa" : "#18181b";
  const chevronColor = muted;

  return (
    <View style={styles.weekBlock}>
      <PressableScale
        style={[
          styles.sectionHeader,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACING.sm,
          },
        ]}
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${week.name}, ${expanded ? "contraer" : "expandir"}`}
      >
        <Text style={[styles.sectionTitle, { color: titleColor }]}>
          {week.name}
        </Text>
        <IconSymbol
          name={expanded ? "chevron.up" : "chevron.down"}
          size={24}
          color={chevronColor}
        />
      </PressableScale>
      {expanded && (
        <View style={styles.dayCardList}>
          {weekDays.map((day) => {
            const exercises = exercisesByDayId[day._id] ?? [];
            const dayBlocks = blocksByDayId[day._id] ?? [];
            return (
              <AssignmentDetailDayCard
                key={day._id}
                day={day}
                exercises={exercises}
                dayBlocks={dayBlocks}
                isDark={isDark}
                muted={muted}
                cardBg={cardBg}
                cardBorder={cardBorder}
                onExercisePress={onExercisePress}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}
