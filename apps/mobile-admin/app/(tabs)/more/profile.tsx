import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppReset } from "@/components/providers/providers";
import { Colors } from "@/constants/theme";
import { getOrgRoleLabel } from "@/lib/security/roles";

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { user } = useUser();
  const { signOut } = useClerk();
  const { resetApp } = useAppReset();
  const router = useRouter();
  const membership = useQuery(
    api.organizationMemberships.getCurrentMembershipWithOrganization,
    {},
  );

  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress;
  const displayName =
    user?.fullName?.trim() ||
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    primaryEmail ||
    "—";

  const onSwitchOrg = () => {
    resetApp();
    router.replace("/select-organization");
  };

  const onSignOut = async () => {
    await signOut();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[
              styles.card,
              {
                borderColor: isDark
                  ? Colors.dark.border
                  : Colors.light.border,
                backgroundColor: isDark ? Colors.dark.muted : "#fff",
              },
            ]}
          >
            <Row label="Nombre" value={displayName} isDark={isDark} />
            {primaryEmail ? (
              <Row label="Email" value={primaryEmail} isDark={isDark} />
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              {
                borderColor: isDark
                  ? Colors.dark.border
                  : Colors.light.border,
                backgroundColor: isDark ? Colors.dark.muted : "#fff",
              },
            ]}
          >
            <Row
              label="Organización"
              value={membership?.organization?.name ?? "—"}
              isDark={isDark}
            />
            <Row
              label="Rol"
              value={getOrgRoleLabel(membership?.role)}
              isDark={isDark}
            />
          </View>

          <View style={styles.actions}>
            <ThemedPressable
              type="secondary"
              lightColor="#f4f4f5"
              darkColor="#18181b"
              style={[
                styles.actionButton,
                {
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
              onPress={onSwitchOrg}
            >
              <MaterialIcons
                name="swap-horiz"
                size={20}
                color={isDark ? "#fff" : "#000"}
              />
              <ThemedText type="defaultSemiBold">
                Cambiar de organización
              </ThemedText>
            </ThemedPressable>

            <ThemedPressable
              type="primary"
              lightColor="#dc2626"
              darkColor="#ef4444"
              style={styles.actionButton}
              onPress={onSignOut}
            >
              <MaterialIcons name="logout" size={20} color="#fff" />
              <ThemedText
                type="defaultSemiBold"
                lightColor="#fff"
                darkColor="#fff"
              >
                Cerrar sesión
              </ThemedText>
            </ThemedPressable>
          </View>
        </ScrollView>
      </View>
    </ThemedView>
  );
}

function Row({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.row}>
      <ThemedText
        style={[
          styles.rowLabel,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
  },
  actions: {
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
});
