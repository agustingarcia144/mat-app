import React from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type FacetChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function FacetChip({ label, selected, onPress }: FacetChipProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected
            ? isDark
              ? "#fff"
              : "#000"
            : isDark
              ? Colors.dark.border
              : Colors.light.border,
          backgroundColor: selected
            ? isDark
              ? "#fff"
              : "#000"
            : "transparent",
        },
      ]}
    >
      <ThemedText
        style={[
          styles.label,
          {
            color: selected
              ? isDark
                ? "#000"
                : "#fff"
              : isDark
                ? "#fff"
                : "#000",
          },
        ]}
      >
        {label}
      </ThemedText>
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: "500" },
});
