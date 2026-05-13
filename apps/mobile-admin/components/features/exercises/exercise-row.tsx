import React from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type ExerciseRowProps = {
  name: string;
  category?: string;
  equipment?: string;
  isStandard?: boolean;
  onPress: () => void;
};

export function ExerciseRow({
  name,
  category,
  equipment,
  isStandard,
  onPress,
}: ExerciseRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {name}
          {isStandard ? " ★" : ""}
        </ThemedText>
        <ThemedText
          style={[
            styles.meta,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
          numberOfLines={1}
        >
          {[category, equipment].filter(Boolean).join(" · ") || "Sin categoría"}
        </ThemedText>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={20}
        color={isDark ? Colors.dark.subtle : Colors.light.subtle}
      />
    </ThemedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
  },
  info: { flex: 1 },
  meta: { fontSize: 12, marginTop: 2 },
});
