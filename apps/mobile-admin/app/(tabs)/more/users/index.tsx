import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { mapMembershipsToMembers } from "@repo/core/utils";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { StaffRow } from "@/components/features/users/staff-row";
import { InvitationRow } from "@/components/features/users/invitation-row";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { isOrgAdminRole, isOrgStaffRole } from "@/lib/security/roles";
import { Colors } from "@/constants/theme";

export default function UsersScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const membership = useCurrentMembership();

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    { includeInactive: true },
  );
  const pendingInvitations = useQuery(api.organizations.listPendingInvitations);
  const revokeInvitation = useMutation(api.organizations.revokeInvitation);

  const staffMembers = useMemo(() => {
    const mapped = mapMembershipsToMembers(memberships ?? []);
    return mapped.filter((m) => isOrgStaffRole(m.role));
  }, [memberships]);

  if (!isOrgAdminRole(membership?.role)) {
    router.replace("/(tabs)/more" as any);
    return null;
  }

  const loading = memberships === undefined || pendingInvitations === undefined;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={styles.addBtn}
              onPress={() => router.push("/(tabs)/more/users/invite" as any)}
            >
              <MaterialIcons
                name="person-add"
                size={18}
                color={isDark ? "#000" : "#fff"}
              />
              <ThemedText
                type="defaultSemiBold"
                style={{ color: isDark ? "#000" : "#fff", fontSize: 13 }}
              >
                Invitar
              </ThemedText>
            </ThemedPressable>
          ),
        }}
      />
      <View style={styles.safe}>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : (
          <FlashList
            data={[
              ...(pendingInvitations.length > 0
                ? [{ type: "section" as const, title: "Invitaciones pendientes" }]
                : []),
              ...pendingInvitations.map((inv: any) => ({
                type: "invitation" as const,
                ...inv,
              })),
              { type: "section" as const, title: "Equipo" },
              ...staffMembers.map((m) => ({
                type: "staff" as const,
                ...m,
              })),
            ]}
            keyExtractor={(item: any) =>
              item.type === "section"
                ? `section-${item.title}`
                : item.id ?? item._id
            }
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }: any) => {
              if (item.type === "section") {
                return (
                  <ThemedText
                    type="defaultSemiBold"
                    style={[
                      styles.sectionHeader,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {item.title}
                  </ThemedText>
                );
              }
              if (item.type === "invitation") {
                return (
                  <InvitationRow
                    email={item.email}
                    role={item.role}
                    onRevoke={() =>
                      revokeInvitation({ invitationId: item._id })
                    }
                  />
                );
              }
              return (
                <StaffRow
                  name={item.name}
                  email={item.email}
                  role={item.role}
                />
              );
            }}
            ListEmptyComponent={
              <EmptyState
                title="Sin usuarios"
                description="Invitá entrenadores o administradores."
              />
            }
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    minHeight: 36,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  sectionHeader: {
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
