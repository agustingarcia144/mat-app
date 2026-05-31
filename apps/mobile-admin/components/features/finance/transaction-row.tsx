import React from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type TransactionRowProps = {
  title: string;
  category?: string;
  occurredOn?: string;
  amountArs: number;
  type: "income" | "expense";
  voided?: boolean;
  onPress: () => void;
};

export function TransactionRow({
  title,
  category,
  occurredOn,
  amountArs,
  type,
  voided,
  onPress,
}: TransactionRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIncome = type === "income";

  return (
    <ThemedPressable
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
          opacity: voided ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: isIncome ? "#dcfce7" : "#fee2e2" },
        ]}
      >
        <MaterialIcons
          name={isIncome ? "arrow-downward" : "arrow-upward"}
          size={16}
          color={isIncome ? "#16a34a" : "#dc2626"}
        />
      </View>
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {title}
          {voided ? " (anulada)" : ""}
        </ThemedText>
        <ThemedText
          style={[
            styles.meta,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
          numberOfLines={1}
        >
          {[category, occurredOn].filter(Boolean).join(" · ")}
        </ThemedText>
      </View>
      <ThemedText
        type="defaultSemiBold"
        style={{ color: isIncome ? "#16a34a" : "#dc2626", fontSize: 14 }}
      >
        {isIncome ? "+" : "-"}${amountArs.toLocaleString("es-AR")}
      </ThemedText>
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
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  meta: { fontSize: 12, marginTop: 2 },
});
