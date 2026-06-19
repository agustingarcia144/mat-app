import React from "react";
import { StyleSheet } from "react-native";
import { Button, Host, Text } from "@expo/ui/swift-ui";
import {
  background,
  bold,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { WorkoutFooterButtonProps } from "./workout-footer-button.types";

/**
 * iOS primary footer button: a solid pill matching the Android variant —
 * white in dark mode, black in light mode, with inverse label color.
 */
export function WorkoutFooterButton({
  label,
  loading,
  onPress,
  colorScheme,
}: WorkoutFooterButtonProps) {
  const isDark = colorScheme === "dark";
  const fill = isDark ? "#FFFFFF" : "#000000";
  const foreground = isDark ? "#000000" : "#FFFFFF";

  return (
    <Host style={styles.host}>
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle("plain"),
          controlSize("large"),
          frame({ maxWidth: Infinity, minHeight: 52 }),
          background(fill, shapes.capsule()),
          disabledModifier(loading),
        ]}
      >
        <Text
          modifiers={[
            foregroundStyle(foreground),
            frame({ maxWidth: Infinity, minHeight: 30 }),
            bold(),
          ]}
        >
          {label}
        </Text>
      </Button>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    height: 52,
    width: "100%",
  },
});
