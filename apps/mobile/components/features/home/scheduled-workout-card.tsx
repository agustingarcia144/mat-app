import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { PressableScale } from "pressto";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";

/** Max exercise names shown in the expanded peek before collapsing to "+N más". */
const MAX_PREVIEW = 6;

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
  exerciseNames?: string[];
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
  exerciseNames,
  onPress,
}: ScheduledWorkoutCardProps) {
  const status = getStatusVisuals(statusBadgeVariant, isDark);
  const [expanded, setExpanded] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  // Height (layout prop → JS driver) and progress (opacity/rotation → native).
  const heightAnim = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  const names = exerciseNames ?? [];
  const canExpand = names.length > 0;
  const previewNames = names.slice(0, MAX_PREVIEW);
  const remaining = names.length - previewNames.length;

  const dividerColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const subtleColor = isDark ? "#a1a1aa" : "#71717a";

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue: expanded ? measuredHeight : 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(progress, {
        toValue: expanded ? 1 : 0,
        duration: expanded ? 240 : 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [expanded, measuredHeight, heightAnim, progress]);

  const chevronRotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const contentTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  return (
    <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
      <PressableScale style={styles.topRow} onPress={onPress}>
        <View style={[styles.iconTile, { backgroundColor: status.tint }]}>
          <IconSymbol name={status.icon} size={24} color={status.accent} />
        </View>

        <View style={styles.content}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {name}
          </ThemedText>

          <View style={styles.metaRow}>
            <View style={[styles.statusPill, { backgroundColor: status.tint }]}>
              <View
                style={[styles.statusDot, { backgroundColor: status.accent }]}
              />
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

      {canExpand && (
        <>
          <Animated.View
            style={[styles.previewWrapper, { height: heightAnim }]}
            pointerEvents={expanded ? "auto" : "none"}
          >
            {/* Absolutely positioned so its natural height is measured
                independently of the animated wrapper height. */}
            <Animated.View
              style={[
                styles.previewMeasure,
                { borderTopColor: dividerColor },
                {
                  opacity: progress,
                  transform: [{ translateY: contentTranslateY }],
                },
              ]}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (h > 0 && Math.abs(h - measuredHeight) > 0.5) {
                  setMeasuredHeight(h);
                }
              }}
            >
              {previewNames.map((exerciseName, index) => (
                <View
                  key={`${exerciseName}-${index}`}
                  style={styles.previewItem}
                >
                  <Text style={[styles.previewIndex, { color: status.accent }]}>
                    {index + 1}
                  </Text>
                  <ThemedText style={styles.previewText} numberOfLines={1}>
                    {exerciseName}
                  </ThemedText>
                </View>
              ))}
              {remaining > 0 && (
                <ThemedText style={[styles.previewMore, { color: subtleColor }]}>
                  +{remaining}{" "}
                  {remaining === 1 ? "ejercicio más" : "ejercicios más"}
                </ThemedText>
              )}
            </Animated.View>
          </Animated.View>

          <Pressable
            style={[styles.expandToggle, { borderTopColor: dividerColor }]}
            onPress={() => setExpanded((prev) => !prev)}
            hitSlop={8}
          >
            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
              <IconSymbol name="chevron.down" size={16} color={subtleColor} />
            </Animated.View>
            <Text style={[styles.expandToggleText, { color: subtleColor }]}>
              {expanded ? "Ocultar ejercicios" : "Ver ejercicios"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  cardLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
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
  previewWrapper: {
    overflow: "hidden",
  },
  previewMeasure: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  previewItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  previewIndex: {
    fontSize: 13,
    fontWeight: "700",
    width: 16,
    textAlign: "center",
  },
  previewText: {
    fontSize: 14,
    flex: 1,
    opacity: 0.9,
  },
  previewMore: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 26,
    marginTop: 2,
  },
  expandToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
