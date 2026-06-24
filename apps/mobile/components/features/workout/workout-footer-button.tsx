import React from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import type { WorkoutFooterButtonProps } from "./workout-footer-button.types";

/**
 * Default (Android / web) primary footer button: the shared themed white pill.
 * iOS uses the Liquid Glass variant in `workout-footer-button.ios.tsx`.
 */
export function WorkoutFooterButton({
  label,
  loading,
  onPress,
  colorScheme,
}: WorkoutFooterButtonProps) {
  const isDark = colorScheme === "dark";
  return (
    <ThemedPressable type="primary" onPress={onPress} disabled={loading}>
      {loading ? (
        <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} />
      ) : (
        <Text style={[styles.text, { color: isDark ? "#000" : "#fff" }]}>
          {label}
        </Text>
      )}
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
