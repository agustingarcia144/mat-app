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

type StatusVisuals = {
  accent: string;
  tint: string;
  icon:
    | "checkmark"
    | "bolt.fill"
    | "figure.strengthtraining.traditional"
    | "xmark";
};

function getStatusVisuals(
  variant: StatusBadgeVariant,
  isDark: boolean,
): StatusVisuals {
  switch (variant) {
    case "completed":
      return {
        accent: isDark ? "#4ade80" : "#16a34a",
        tint: "rgba(34,197,94,0.16)",
        icon: "checkmark",
      };
    case "inProgress":
      return {
        accent: isDark ? "#60a5fa" : "#2563eb",
        tint: "rgba(59,130,246,0.16)",
        icon: "bolt.fill",
      };
    case "notStarted":
      return {
        accent: isDark ? "#fb923c" : "#ea580c",
        tint: "rgba(249,115,22,0.16)",
        icon: "figure.strengthtraining.traditional",
      };
    case "skipped":
      return {
        accent: isDark ? "#a1a1aa" : "#71717a",
        tint: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
        icon: "xmark",
      };
  }
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
  const status = getStatusVisuals(statusBadgeVariant, isDark);

  return (
    <PressableScale
      style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}
      onPress={onPress}
    >
      <View style={[styles.iconTile, { backgroundColor: status.tint }]}>
        <IconSymbol name={status.icon} size={24} color={status.accent} />
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {name}
        </ThemedText>

        <View style={styles.metaRow}>
          <View style={[styles.statusPill, { backgroundColor: status.tint }]}>
            <View style={[styles.statusDot, { backgroundColor: status.accent }]} />
            <Text style={[styles.statusPillText, { color: status.accent }]}>
              {statusBadgeLabel}
            </Text>
          </View>

          <ThemedText style={styles.metaText}>
            {blockCount} {blockCount === 1 ? "bloque" : "bloques"} ·{" "}
            {exerciseCount} {exerciseCount === 1 ? "ejercicio" : "ejercicios"}
          </ThemedText>
        </View>
      </View>

      <IconSymbol
        name="chevron.right"
        size={20}
        color={isDark ? "#52525b" : "#a1a1aa"}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 13,
    opacity: 0.65,
  },
});
