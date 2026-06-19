import React from "react";
import { View, StyleSheet } from "react-native";
import { WorkoutFooterButton } from "./workout-footer-button";

export interface WorkoutFooterProps {
  isNewSession: boolean;
  isCompleted: boolean;
  starting: boolean;
  completing: boolean;
  onStartWorkout: () => void;
  onComplete: () => void;
  paddingBottom: number;
  isDark: boolean;
  colorScheme: "light" | "dark" | null;
}

export function WorkoutFooter({
  isNewSession,
  isCompleted,
  starting,
  completing,
  onStartWorkout,
  onComplete,
  paddingBottom,
  colorScheme,
}: WorkoutFooterProps) {
  if (isNewSession) {
    return (
      <View style={[styles.footer, { paddingBottom }]} pointerEvents="box-none">
        <WorkoutFooterButton
          label="Empezar entrenamiento"
          loading={starting}
          onPress={onStartWorkout}
          colorScheme={colorScheme}
        />
      </View>
    );
  }

  if (!isCompleted) {
    return (
      <View style={[styles.footer, { paddingBottom }]} pointerEvents="box-none">
        <WorkoutFooterButton
          label="Completar entrenamiento"
          loading={completing}
          onPress={onComplete}
          colorScheme={colorScheme}
        />
      </View>
    );
  }

  // Completed sessions show no footer.
  return null;
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
});
