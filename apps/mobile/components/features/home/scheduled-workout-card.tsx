import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { PressableScale } from "pressto";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";

export type StatusBadgeVariant =
  | "completed"
  | "inProgress"
  | "notStarted"
  | "skipped";

export interface ScheduledWorkoutCardProps {
  name: string;
  isDark: boolean;
  statusBadgeVariant: StatusBadgeVariant;
  statusBadgeLabel: string;
  blockCount: number;
  exerciseCount: number;
  onPress: () => void;
}

export function ScheduledWorkoutCard({
  name,
  isDark,
  statusBadgeVariant,
  statusBadgeLabel,
  blockCount,
  exerciseCount,
  onPress,
}: ScheduledWorkoutCardProps) {
  return (
    <PressableScale
      style={[styles.workoutCard, isDark && styles.workoutCardDark]}
      onPress={onPress}
    >
      <View style={styles.workoutCardContent}>
        <ThemedText style={styles.workoutCardTitle}>{name}</ThemedText>
        <View style={styles.workoutCardStatusRow}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  statusBadgeVariant === "completed"
                    ? isDark
                      ? "#16a34a"
                      : "#22c55e"
                    : statusBadgeVariant === "inProgress"
                      ? isDark
                        ? "#2563eb"
                        : "#3b82f6"
                      : statusBadgeVariant === "notStarted"
                        ? isDark
                          ? "#ea580c"
                          : "#f97316"
                        : isDark
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                (statusBadgeVariant === "completed" ||
                  statusBadgeVariant === "inProgress" ||
                  statusBadgeVariant === "notStarted") && {
                  color: "#fff",
                },
                statusBadgeVariant === "skipped" && {
                  color: isDark ? "#a1a1aa" : "#52525b",
                },
              ]}
            >
              {statusBadgeLabel}
            </Text>
          </View>
        </View>
        <View style={styles.workoutCardMeta}>
          <ThemedText style={styles.workoutCardMetaText}>
            {blockCount} {blockCount === 1 ? "bloque" : "bloques"}
          </ThemedText>
          <ThemedText style={styles.workoutCardMetaDot}>·</ThemedText>
          <ThemedText style={styles.workoutCardMetaText}>
            {exerciseCount} {exerciseCount === 1 ? "ejercicio" : "ejercicios"}
          </ThemedText>
        </View>
      </View>
      <IconSymbol
        name="chevron.right"
        size={20}
        color={isDark ? "#a1a1aa" : "#71717a"}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  workoutCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.08)",
  },
  workoutCardContent: {
    flex: 1,
  },
  workoutCardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  workoutCardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  workoutCardStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  workoutCardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  workoutCardMetaText: {
    fontSize: 13,
    opacity: 0.75,
  },
  workoutCardMetaDot: {
    fontSize: 13,
    opacity: 0.5,
  },
});
