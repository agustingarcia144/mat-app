import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { MetricCard } from "@/components/features/metrics/metric-card";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

const normalize = (v?: string) => v?.trim().toLowerCase() ?? "";

export default function ExerciseMetricsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const data = useQuery(api.metrics.getExerciseMetricsByMembers);
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    if (!data?.members) return [];
    const term = normalize(search);
    if (!term) return data.members;
    return data.members.filter(
      (m: any) =>
        normalize(m.name).includes(term) ||
        normalize(m.email).includes(term),
    );
  }, [data?.members, search]);

  const selectedMember =
    data?.members?.find((m: any) => m.userId === selectedMemberId) ?? null;

  if (!data) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <View style={styles.summaryRow}>
          <MetricCard
            label="Miembros"
            value={String(data.summary?.membersTracked ?? 0)}
          />
          <MetricCard
            label="Ejercicios"
            value={String(data.summary?.exercisesTracked ?? 0)}
          />
        </View>

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
            placeholder="Buscar miembro..."
            placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {selectedMember ? (
          <View style={styles.detailWrapper}>
            <ThemedPressable
              onPress={() => setSelectedMemberId(null)}
              style={styles.backLink}
            >
              <MaterialIcons
                name="arrow-back"
                size={18}
                color={isDark ? Colors.dark.subtle : Colors.light.subtle}
              />
              <ThemedText
                style={{
                  color: isDark ? Colors.dark.subtle : Colors.light.subtle,
                  fontSize: 13,
                }}
              >
                Volver a la lista
              </ThemedText>
            </ThemedPressable>
            <ThemedText type="defaultSemiBold" style={styles.memberName}>
              {selectedMember.name}
            </ThemedText>
            <FlashList
              data={selectedMember.exercises ?? []}
              keyExtractor={(e: any) => e.exerciseId}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item: ex }: any) => (
                <View
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: isDark ? Colors.dark.border : Colors.light.border,
                      backgroundColor: isDark ? Colors.dark.muted : "#fff",
                    },
                  ]}
                >
                  <View style={styles.exHeader}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={{ flex: 1 }}>
                      {ex.exerciseName}
                    </ThemedText>
                    <TrendPill trend={ex.trend} delta={ex.weightDelta} />
                  </View>
                  <View style={styles.exStats}>
                    <StatBox
                      label="Primer peso"
                      value={ex.firstWeight != null ? `${ex.firstWeight}kg` : "—"}
                      isDark={isDark}
                    />
                    <StatBox
                      label="Último peso"
                      value={ex.latestWeight != null ? `${ex.latestWeight}kg` : "—"}
                      isDark={isDark}
                    />
                    <StatBox
                      label="Mejor peso"
                      value={ex.bestWeight != null ? `${ex.bestWeight}kg` : "—"}
                      isDark={isDark}
                    />
                    <StatBox
                      label="Registros"
                      value={String(ex.entriesCount ?? 0)}
                      isDark={isDark}
                    />
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <EmptyState
                  title="Sin ejercicios"
                  description="Este miembro no tiene registros."
                />
              }
            />
          </View>
        ) : (
          <FlashList
            data={filteredMembers}
            keyExtractor={(m: any) => m.userId}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item: m }: any) => (
              <ThemedPressable
                onPress={() => setSelectedMemberId(m.userId)}
                style={[
                  styles.memberRow,
                  {
                    borderColor: isDark ? Colors.dark.border : Colors.light.border,
                    backgroundColor: isDark ? Colors.dark.muted : "#fff",
                  },
                ]}
              >
                <View style={styles.memberInfo}>
                  <ThemedText type="defaultSemiBold" numberOfLines={1}>
                    {m.name}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.memberMeta,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {m.totalSessions ?? 0} sesiones · {(m.exercises ?? []).length}{" "}
                    ejercicios
                  </ThemedText>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={isDark ? Colors.dark.subtle : Colors.light.subtle}
                />
              </ThemedPressable>
            )}
            ListEmptyComponent={
              <EmptyState
                title="Sin datos"
                description="No hay registros de ejercicios para ningún miembro."
              />
            }
          />
        )}
      </View>
    </ThemedView>
  );
}

function TrendPill({ trend, delta }: { trend?: string; delta?: number }) {
  if (!trend) return null;
  const color =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#a1a1aa";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <View style={[trendStyles.pill, { backgroundColor: `${color}22` }]}>
      <ThemedText style={[trendStyles.text, { color }]}>
        {arrow} {delta != null ? `${delta > 0 ? "+" : ""}${delta}kg` : ""}
      </ThemedText>
    </View>
  );
}

function StatBox({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={statStyles.box}>
      <ThemedText
        style={[
          statStyles.label,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText type="defaultSemiBold" style={statStyles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

const trendStyles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999 },
  text: { fontSize: 11, fontWeight: "600" },
});

const statStyles = StyleSheet.create({
  box: { alignItems: "center", flex: 1 },
  label: { fontSize: 10, marginBottom: 2 },
  value: { fontSize: 14 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12, marginBottom: 12 },
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
  searchInput: { flex: 1, fontSize: 15, height: "100%" },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
  },
  memberInfo: { flex: 1 },
  memberMeta: { fontSize: 12, marginTop: 2 },
  memberName: { fontSize: 18, paddingHorizontal: 20, marginBottom: 12 },
  detailWrapper: { flex: 1 },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  exerciseCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  exHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  exStats: { flexDirection: "row", gap: 4 },
});
