import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ExerciseRow } from "@/components/features/exercises/exercise-row";
import { FacetChip } from "@/components/features/exercises/facet-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { Colors } from "@/constants/theme";

const normalize = (v?: string) => v?.trim().toLowerCase() ?? "";

export default function ExercisesListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const orgSettings = useOrgSettings();

  const exercises = useQuery(api.exercises.getByOrganization);
  const facets = useQuery(api.exercises.listFacets);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!exercises) return [];
    let result = exercises;
    const term = normalize(search);
    if (term) {
      result = result.filter(
        (e: any) =>
          normalize(e.name).includes(term) ||
          normalize(e.description).includes(term) ||
          (e.muscleGroups ?? []).some((mg: string) =>
            normalize(mg).includes(term),
          ),
      );
    }
    if (selectedCategory) {
      result = result.filter((e: any) => e.category === selectedCategory);
    }
    if (selectedEquipment) {
      result = result.filter((e: any) => e.equipment === selectedEquipment);
    }
    return result;
  }, [exercises, search, selectedCategory, selectedEquipment]);

  if (orgSettings && orgSettings.planificationsEnabled === false) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <View style={styles.safeFull}>
          <EmptyState
            title="Ejercicios deshabilitados"
            description="El módulo de planificaciones no está activado."
          />
        </View>
      </ThemedView>
    );
  }

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
              onPress={() => router.push("/(tabs)/more/exercises/new" as any)}
            >
              <MaterialIcons
                name="add"
                size={18}
                color={isDark ? "#000" : "#fff"}
              />
            </ThemedPressable>
          ),
        }}
      />
      <View style={styles.safe}>

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
            style={[styles.searchInput, { color: isDark ? "#fff" : "#000" }]}
            placeholder="Buscar ejercicios..."
            placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {facets ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {(facets.categories ?? []).map((c: string) => (
              <FacetChip
                key={c}
                label={c}
                selected={selectedCategory === c}
                onPress={() =>
                  setSelectedCategory(selectedCategory === c ? null : c)
                }
              />
            ))}
            {(facets.equipment ?? []).map((e: string) => (
              <FacetChip
                key={e}
                label={e}
                selected={selectedEquipment === e}
                onPress={() =>
                  setSelectedEquipment(selectedEquipment === e ? null : e)
                }
              />
            ))}
          </ScrollView>
        ) : null}

        {exercises === undefined ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title="Sin ejercicios"
              description={
                search || selectedCategory || selectedEquipment
                  ? "No se encontraron ejercicios con esos filtros."
                  : "Aún no hay ejercicios creados."
              }
            />
          </View>
        ) : (
          <FlashList
            data={filtered}
            keyExtractor={(e: any) => e._id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }: any) => (
              <ExerciseRow
                name={item.name}
                category={item.category}
                equipment={item.equipment}
                isStandard={item.isStandard}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/more/exercises/[exerciseId]" as any,
                    params: { exerciseId: item._id },
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
  container: { flex: 1 },
  safe: { flex: 1 },
  safeFull: { flex: 1, alignItems: "center", justifyContent: "center" },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrapper: {
    marginHorizontal: 20,
    marginBottom: 8,
    height: 44,
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, height: "100%" },
  chipRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
