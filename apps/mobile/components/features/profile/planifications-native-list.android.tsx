import React from "react";
import {
  Column,
  Host,
  LazyColumn,
  ListItem,
  Text,
} from "@expo/ui/jetpack-compose";
import { clickable, fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import type {
  PlanificationListItem,
  PlanificationsNativeListProps,
} from "./profile-native-list.types";

const DARK_TEXT = "#f4f4f5";
const LIGHT_TEXT = "#18181b";
const DARK_MUTED = "#a1a1aa";
const LIGHT_MUTED = "#71717a";
const DARK_ROW = "#141414";
const LIGHT_ROW = "#f4f4f5";

function textColor(isDark: boolean) {
  return isDark ? DARK_TEXT : LIGHT_TEXT;
}

function mutedColor(isDark: boolean) {
  return isDark ? DARK_MUTED : LIGHT_MUTED;
}

function rowColor(isDark: boolean) {
  return isDark ? DARK_ROW : LIGHT_ROW;
}

function SectionHeader({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text
      color={mutedColor(isDark)}
      style={{ typography: "labelMedium", fontWeight: "700" }}
    >
      {title.toUpperCase()}
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
    <ListItem
      colors={{
        containerColor: rowColor(isDark),
        contentColor: textColor(isDark),
        supportingContentColor: mutedColor(isDark),
        trailingContentColor: mutedColor(isDark),
      }}
      modifiers={[fillMaxWidth(), clickable(() => onOpen(item.id))]}
    >
      <ListItem.HeadlineContent>
        <Text
          color={textColor(isDark)}
          style={{ typography: "bodyLarge", fontWeight: "600" }}
        >
          {item.name}
        </Text>
      </ListItem.HeadlineContent>
      <ListItem.SupportingContent>
        <Text color={mutedColor(isDark)} style={{ typography: "bodyMedium" }}>
          {[item.weeksLabel, item.dateRange].filter(Boolean).join(" · ")}
        </Text>
      </ListItem.SupportingContent>
      <ListItem.TrailingContent>
        <Text color={mutedColor(isDark)}>›</Text>
      </ListItem.TrailingContent>
    </ListItem>
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
      style={{ flex: 1, backgroundColor }}
      colorScheme={isDark ? "dark" : "light"}
      useViewportSizeMeasurement
    >
      <LazyColumn
        contentPadding={{ start: 24, top: 96, end: 24, bottom: 40 }}
        verticalArrangement={{ spacedBy: 12 }}
      >
        {loading ? (
          <ListItem
            colors={{
              containerColor: rowColor(isDark),
              contentColor: textColor(isDark),
            }}
            modifiers={[fillMaxWidth()]}
          >
            <ListItem.HeadlineContent>
              <Text color={textColor(isDark)}>Cargando...</Text>
            </ListItem.HeadlineContent>
          </ListItem>
        ) : hasPlanifications ? (
          <>
            {active.length > 0 ? (
              <Column verticalArrangement={{ spacedBy: 8 }}>
                <SectionHeader title="Activas" isDark={isDark} />
                <PlanRows items={active} isDark={isDark} onOpen={onOpen} />
              </Column>
            ) : null}
            {other.length > 0 ? (
              <Column verticalArrangement={{ spacedBy: 8 }}>
                <SectionHeader title="Otras" isDark={isDark} />
                <PlanRows items={other} isDark={isDark} onOpen={onOpen} />
              </Column>
            ) : null}
          </>
        ) : (
          <ListItem
            colors={{
              containerColor: rowColor(isDark),
              contentColor: textColor(isDark),
              supportingContentColor: mutedColor(isDark),
            }}
            modifiers={[fillMaxWidth()]}
          >
            <ListItem.HeadlineContent>
              <Text
                color={textColor(isDark)}
                style={{ typography: "bodyLarge", fontWeight: "600" }}
              >
                No tienes planificaciones asignadas
              </Text>
            </ListItem.HeadlineContent>
            <ListItem.SupportingContent>
              <Text
                color={mutedColor(isDark)}
                style={{ typography: "bodyMedium" }}
              >
                Contacta a tu entrenador para que te asigne una rutina
              </Text>
            </ListItem.SupportingContent>
          </ListItem>
        )}
      </LazyColumn>
    </Host>
  );
}
