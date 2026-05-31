import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { format, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { ThemedText } from "./themed-text";
import { ThemedPressable } from "./themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type MonthPickerProps = {
  value: string;
  onChange: (period: string) => void;
  monthCount?: number;
};

export function MonthPicker({ value, onChange, monthCount = 12 }: MonthPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const periods = useMemo(() => {
    const now = new Date();
    return Array.from({ length: monthCount }, (_, i) => {
      const d = subMonths(now, i);
      return {
        value: format(d, "yyyy-MM"),
        label: format(d, "MMMM yyyy", { locale: es }),
      };
    });
  }, [monthCount]);

  const currentIndex = periods.findIndex((p) => p.value === value);
  const currentLabel =
    periods.find((p) => p.value === value)?.label ?? value;

  const goPrev = () => {
    if (currentIndex < periods.length - 1) {
      onChange(periods[currentIndex + 1].value);
    }
  };

  const goNext = () => {
    if (currentIndex > 0) {
      onChange(periods[currentIndex - 1].value);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <ThemedPressable
        onPress={goPrev}
        style={styles.navBtn}
        disabled={currentIndex >= periods.length - 1}
      >
        <MaterialIcons
          name="chevron-left"
          size={22}
          color={
            currentIndex >= periods.length - 1
              ? isDark
                ? "#444"
                : "#ccc"
              : isDark
                ? "#fff"
                : "#000"
          }
        />
      </ThemedPressable>
      <ThemedText type="defaultSemiBold" style={styles.label}>
        {currentLabel}
      </ThemedText>
      <ThemedPressable
        onPress={goNext}
        style={styles.navBtn}
        disabled={currentIndex <= 0}
      >
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={
            currentIndex <= 0
              ? isDark
                ? "#444"
                : "#ccc"
              : isDark
                ? "#fff"
                : "#000"
          }
        />
      </ThemedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontSize: 14,
    textTransform: "capitalize",
  },
});
