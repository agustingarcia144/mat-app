import React from "react";
import { StyleSheet, Switch, View } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type SettingRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
};

export function SettingRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: SettingRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View style={styles.row}>
      <View style={styles.textColumn}>
        <ThemedText type="defaultSemiBold" style={styles.label}>
          {label}
        </ThemedText>
        {description ? (
          <ThemedText
            style={[
              styles.desc,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
          >
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: isDark ? "#333" : "#d4d4d8", true: "#22c55e" }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  textColumn: { flex: 1 },
  label: { fontSize: 15 },
  desc: { fontSize: 12, marginTop: 2 },
});
