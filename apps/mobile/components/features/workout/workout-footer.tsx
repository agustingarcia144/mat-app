import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { ThemedPressable } from "@/components/ui/themed-pressable";

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
  isDark,
  colorScheme,
}: WorkoutFooterProps) {
  if (isNewSession) {
    return (
      <View
        style={[
          styles.footer,
          {
            paddingBottom,
            backgroundColor: isDark ? "#0a0a0a" : "#fff",
          },
        ]}
      >
        <ThemedPressable
          type="primary"
          onPress={onStartWorkout}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator
              size="small"
              color={colorScheme === "dark" ? "#000" : "#fff"}
            />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: colorScheme === "dark" ? "#000" : "#fff" },
              ]}
            >
              Empezar entrenamiento
            </Text>
          )}
        </ThemedPressable>
      </View>
    );
  }

  if (!isCompleted) {
    return (
      <View
        style={[
          styles.footer,
          {
            paddingBottom,
            backgroundColor: isDark ? "#0a0a0a" : "#fff",
          },
        ]}
      >
        <ThemedPressable
          type="primary"
          onPress={onComplete}
          disabled={completing}
        >
          {completing ? (
            <ActivityIndicator
              size="small"
              color={colorScheme === "dark" ? "#000" : "#fff"}
            />
          ) : (
            <Text
              style={[
                styles.primaryButtonText,
                { color: colorScheme === "dark" ? "#000" : "#fff" },
              ]}
            >
              Completar entrenamiento
            </Text>
          )}
        </ThemedPressable>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom,
          backgroundColor: isDark ? "#0a0a0a" : "#fff",
        },
      ]}
    >
      <Text style={styles.completedLabel}>Sesión completada</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  completedLabel: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    opacity: 0.8,
  },
});
