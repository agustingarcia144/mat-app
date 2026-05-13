import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { mapMembershipsToMembers } from "@repo/core/utils";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { MemberRow } from "@/components/features/members/member-row";
import { EmptyState } from "@/components/ui/empty-state";

const normalize = (value?: string) =>
  value?.toString().trim().toLowerCase() ?? "";

export default function MembersListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [search, setSearch] = useState("");

  const memberships = useQuery(
    api.organizationMemberships.getOrganizationMemberships,
    { includeInactive: true },
  );

  const members = useMemo(() => {
    const mapped = mapMembershipsToMembers(memberships ?? []);
    return mapped.filter(
      (m) => normalize(m.role) === "member" || normalize(m.role) === "miembro",
    );
  }, [memberships]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    if (!term) return members;
    return members.filter(
      (m) =>
        normalize(m.name).includes(term) ||
        normalize(m.email).includes(term),
    );
  }, [members, search]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <ThemedText
          style={[
            styles.subtitle,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          {filtered.length} resultados
        </ThemedText>

        <View
          style={[
            styles.searchWrapper,
            {
              backgroundColor: isDark ? Colors.dark.muted : Colors.light.muted,
              borderColor: isDark ? Colors.dark.border : Colors.light.border,
            },
          ]}
        >
          <MaterialIcons
            name="search"
            size={18}
            color={isDark ? Colors.dark.subtle : Colors.light.subtle}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: isDark ? "#fff" : "#000" },
            ]}
            placeholder="Buscar por nombre o email..."
            placeholderTextColor={
              isDark ? Colors.dark.subtle : Colors.light.subtle
            }
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {memberships === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title="Sin miembros"
              description={
                search
                  ? "No se encontraron miembros con ese criterio."
                  : "Aún no hay miembros en esta organización."
              }
            />
          </View>
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
              <MemberRow
                name={item.name}
                email={item.email}
                imageUrl={item.imageUrl}
                status={item.status}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/members/[memberId]",
                    params: { memberId: item.id },
                  })
                }
              />
            )}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  subtitle: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    fontSize: 13,
  },
  searchWrapper: {
    marginHorizontal: 20,
    marginBottom: 12,
    height: 44,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
