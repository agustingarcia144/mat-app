import React from "react";
import { StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { PaymentStatusPill } from "./payment-status-pill";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type PaymentRowProps = {
  memberName: string;
  planName?: string;
  billingPeriod?: string;
  amountArs?: number;
  status?: string;
  onPress: () => void;
};

export function PaymentRow({
  memberName,
  planName,
  billingPeriod,
  amountArs,
  status,
  onPress,
}: PaymentRowProps) {
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
          {memberName}
        </ThemedText>
        <ThemedText
          style={[
            styles.meta,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
          numberOfLines={1}
        >
          {[planName, billingPeriod].filter(Boolean).join(" · ")}
        </ThemedText>
      </View>
      <View style={styles.right}>
        {amountArs != null ? (
          <ThemedText type="defaultSemiBold" style={styles.amount}>
            ${amountArs.toLocaleString("es-AR")}
          </ThemedText>
        ) : null}
        {status ? <PaymentStatusPill status={status} /> : null}
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
    gap: 10,
  },
  info: { flex: 1 },
  meta: { fontSize: 12, marginTop: 2 },
  right: { alignItems: "flex-end", gap: 4 },
  amount: { fontSize: 14 },
});
