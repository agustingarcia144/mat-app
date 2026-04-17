import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  Host,
  List,
  RNHostView,
  Section,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  background as swiftBackground,
  font,
  foregroundStyle,
  listStyle,
  onTapGesture,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import type {
  PlanificationListItem,
  PlanificationsNativeListProps,
} from "./profile-native-list.types";

function PlanRow({
  item,
  isDark,
  onOpen,
}: {
  item: PlanificationListItem;
  isDark: boolean;
  onOpen: (assignmentId: string) => void;
}) {
  const subtitle = [item.weeksLabel, item.dateRange]
    .filter(Boolean)
    .join(" · ");

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[onTapGesture(() => onOpen(item.id))]}
    >
      <Text
        modifiers={[
          font({ size: 16, weight: "semibold" }),
          foregroundStyle(isDark ? "#fff" : "#000"),
        ]}
      >
        {item.name}
      </Text>
      {subtitle ? (
        <Text
          modifiers={[
            font({ size: 13 }),
            foregroundStyle(isDark ? "#a1a1aa" : "#71717a"),
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </VStack>
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
    <Host
      style={[styles.host, { backgroundColor }]}
      colorScheme={isDark ? "dark" : "light"}
      useViewportSizeMeasurement
    >
      <List
        modifiers={[
          listStyle("insetGrouped"),
          scrollContentBackground("hidden"),
          swiftBackground(backgroundColor),
        ]}
      >
        {loading ? (
          <Section>
            <RNHostView matchContents>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={isDark ? "#fff" : "#000"} />
              </View>
            </RNHostView>
          </Section>
        ) : hasPlanifications ? (
          <>
            {active.length > 0 ? (
              <Section title="Activas">
                <PlanRows items={active} isDark={isDark} onOpen={onOpen} />
              </Section>
            ) : null}
            {other.length > 0 ? (
              <Section title="Otras">
                <PlanRows items={other} isDark={isDark} onOpen={onOpen} />
              </Section>
            ) : null}
          </>
        ) : (
          <Section>
            <VStack alignment="leading" spacing={4}>
              <Text
                modifiers={[
                  font({ size: 16, weight: "semibold" }),
                  foregroundStyle(isDark ? "#fff" : "#000"),
                ]}
              >
                No tienes planificaciones asignadas
              </Text>
              <Text
                modifiers={[
                  font({ size: 14 }),
                  foregroundStyle(isDark ? "#a1a1aa" : "#71717a"),
                ]}
              >
                Contacta a tu entrenador para que te asigne una rutina
              </Text>
            </VStack>
          </Section>
        )}
      </List>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  loadingRow: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
