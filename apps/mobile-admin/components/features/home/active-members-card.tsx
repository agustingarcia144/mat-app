import React from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export function ActiveMembersCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    {},
  );

  const activeCount =
    memberships?.filter((m) => {
      const status = m.status?.toLowerCase();
      const role = m.role?.toLowerCase();
      return (status === "active" || status === "activo") && role === "member";
    }).length ?? 0;

  const totalCount =
    memberships?.filter((m) => m.role?.toLowerCase() === "member").length ?? 0;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Miembros activos
        </ThemedText>
        <MaterialIcons
          name="people"
          size={20}
          color={isDark ? Colors.dark.icon : Colors.light.icon}
        />
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.count}>{activeCount}</ThemedText>
        <ThemedText
          style={[
            styles.subtitle,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          de {totalCount} totales
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    minHeight: 120,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
  },
  body: {
    marginTop: 8,
  },
  count: {
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
});
