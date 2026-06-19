import React, { useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WorkoutFooterButton } from "./workout-footer-button";

export interface WorkoutFooterProps {
  isNewSession: boolean;
  isCompleted: boolean;
  /** May be async; the button shows a spinner while it resolves. */
  onStartWorkout: () => void | Promise<void>;
  /** May be async; the button shows a spinner while it resolves. */
  onComplete: () => void | Promise<void>;
  paddingBottom: number;
  isDark: boolean;
  colorScheme: "light" | "dark" | null;
}

export function WorkoutFooter({
  isNewSession,
  isCompleted,
  onStartWorkout,
  onComplete,
  paddingBottom,
  colorScheme,
}: WorkoutFooterProps) {
  // Pending lives here so a press only re-renders the footer button, not the
  // whole workout screen.
  const [pending, setPending] = useState(false);
  const action = isNewSession ? onStartWorkout : onComplete;
  const handlePress = useCallback(() => {
    if (pending) return;
    setPending(true);
    Promise.resolve(action()).finally(() => setPending(false));
  }, [pending, action]);

  // Completed sessions show no footer.
  if (!isNewSession && isCompleted) {
    return null;
  }

  return (
    <View style={[styles.footer, { paddingBottom }]} pointerEvents="box-none">
      <WorkoutFooterButton
        label={
          isNewSession ? "Empezar entrenamiento" : "Completar entrenamiento"
        }
        loading={pending}
        onPress={handlePress}
        colorScheme={colorScheme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
});
