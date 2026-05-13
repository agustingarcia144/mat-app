import React from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { getOrgRoleLabel } from "@/lib/security/roles";

type StaffRowProps = {
  name: string;
  email?: string;
  role?: string;
};

export function StaffRow({ name, email, role }: StaffRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
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
        </ThemedText>
        {email ? (
          <ThemedText
            style={[
              styles.email,
              { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
            ]}
            numberOfLines={1}
          >
            {email}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.badge,
          {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.1)"
              : "rgba(0,0,0,0.06)",
          },
        ]}
      >
        <ThemedText style={styles.badgeText}>
          {getOrgRoleLabel(role)}
        </ThemedText>
      </View>
    </View>
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
  email: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  badgeText: { fontSize: 12, fontWeight: "500" },
});
