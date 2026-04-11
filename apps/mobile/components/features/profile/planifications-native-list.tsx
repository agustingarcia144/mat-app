import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  PlanificationListItem,
  PlanificationsNativeListProps,
} from "./profile-native-list.types";

function SectionTitle({
  children,
  isDark,
}: {
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <Text
      style={[
        styles.sectionTitle,
        { color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)" },
      ]}
    >
      {children}
    </Text>
  );
}

function PlanRow({
  item,
  isDark,
  onOpen,
}: {
  item: PlanificationListItem;
  isDark: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  return (
    <Pressable
      style={[styles.row, { backgroundColor: isDark ? "#141414" : "#f4f4f5" }]}
      onPress={() => onOpen(item.id)}
    >
      <View style={styles.rowTextBlock}>
        <Text style={[styles.rowTitle, { color: isDark ? "#fff" : "#000" }]}>
          {item.name}
        </Text>
        <Text
          style={[
            styles.rowSubtitle,
            { color: isDark ? "#a1a1aa" : "#71717a" },
          ]}
        >
          {[item.weeksLabel, item.dateRange].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: isDark ? "#71717a" : "#a1a1aa" }]}>
        ›
      </Text>
    </Pressable>
  );
}

function PlanRows({
  items,
  isDark,
  onOpen,
}: {
  items: PlanificationListItem[];
  isDark: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <PlanRow key={item.id} item={item} isDark={isDark} onOpen={onOpen} />
      ))}
    </>
  );
}

export function PlanificationsNativeList({
  isDark,
  backgroundColor,
  loading,
  active,
  other,
  onOpen,
}: PlanificationsNativeListProps) {
  const hasPlanifications = active.length > 0 || other.length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {loading ? (
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      ) : hasPlanifications ? (
        <>
          {active.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle isDark={isDark}>Activas</SectionTitle>
              <PlanRows items={active} isDark={isDark} onOpen={onOpen} />
            </View>
          ) : null}
          {other.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle isDark={isDark}>Otras</SectionTitle>
              <PlanRows items={other} isDark={isDark} onOpen={onOpen} />
            </View>
          ) : null}
        </>
      ) : (
        <View
          style={[
            styles.emptyBlock,
            { backgroundColor: isDark ? "#141414" : "#f4f4f5" },
          ]}
        >
          <Text
            style={[styles.emptyTitle, { color: isDark ? "#fff" : "#000" }]}
          >
            No tienes planificaciones asignadas
          </Text>
          <Text
            style={[
              styles.emptyDescription,
              { color: isDark ? "#a1a1aa" : "#71717a" },
            ]}
          >
            Contacta a tu entrenador para que te asigne una rutina
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 40,
  },
  section: {
    width: "100%",
    marginTop: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    minHeight: 60,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
  },
  emptyBlock: {
    marginTop: 24,
    borderRadius: 12,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
