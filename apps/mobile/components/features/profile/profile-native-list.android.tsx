import React from "react";
import { Image, StyleSheet, Text as RNText, View } from "react-native";
import {
  Column,
  Host,
  LazyColumn,
  ListItem,
  RNHostView,
  Text,
} from "@expo/ui/jetpack-compose";
import { clickable, fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import type { ProfileNativeListProps } from "./profile-native-list.types";

const DARK_TEXT = "#f4f4f5";
const LIGHT_TEXT = "#18181b";
const DARK_MUTED = "#a1a1aa";
const LIGHT_MUTED = "#71717a";
const DARK_ROW = "#141414";
const LIGHT_ROW = "#f4f4f5";
const DANGER_COLOR = "#ef4444";

function textColor(isDark: boolean) {
  return isDark ? DARK_TEXT : LIGHT_TEXT;
}

function mutedColor(isDark: boolean) {
  return isDark ? DARK_MUTED : LIGHT_MUTED;
}

function rowColor(isDark: boolean) {
  return isDark ? DARK_ROW : LIGHT_ROW;
}

function ProfileHeader({
  profile,
  isDark,
}: Pick<ProfileNativeListProps, "profile" | "isDark">) {
  return (
    <RNHostView matchContents>
      <View style={styles.profileHeader}>
        {profile.imageUrl ? (
          <Image
            source={{ uri: profile.imageUrl }}
            style={styles.avatar}
            accessibilityLabel="Avatar"
          />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
          >
            <RNText
              style={[
                styles.avatarPlaceholderText,
                { color: isDark ? "#fff" : "#000" },
              ]}
            >
              {profile.initials}
            </RNText>
          </View>
        )}
        <RNText style={[styles.profileTitle, { color: textColor(isDark) }]}>
          {profile.fullName}
        </RNText>
        {profile.primaryEmail ? (
          <RNText
            style={[styles.profileSubtitle, { color: mutedColor(isDark) }]}
          >
            {profile.primaryEmail}
          </RNText>
        ) : null}
      </View>
    </RNHostView>
  );
}

function NativeRow({
  title,
  isDark,
  onPress,
  textColorOverride,
  rowColorOverride,
  showTrailing = true,
}: {
  title: string;
  isDark: boolean;
  onPress?: () => void;
  textColorOverride?: string;
  rowColorOverride?: string;
  showTrailing?: boolean;
}) {
  const currentTextColor = textColorOverride ?? textColor(isDark);

  return (
    <ListItem
      colors={{
        containerColor: rowColorOverride ?? rowColor(isDark),
        contentColor: currentTextColor,
        trailingContentColor: mutedColor(isDark),
      }}
      modifiers={[fillMaxWidth(), ...(onPress ? [clickable(onPress)] : [])]}
    >
      <ListItem.HeadlineContent>
        <Text
          color={currentTextColor}
          style={{ typography: "bodyLarge", fontWeight: "600" }}
        >
          {title}
        </Text>
      </ListItem.HeadlineContent>
      {onPress && showTrailing ? (
        <ListItem.TrailingContent>
          <Text color={mutedColor(isDark)}>›</Text>
        </ListItem.TrailingContent>
      ) : null}
    </ListItem>
  );
}

function SectionHeader({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <Text
      color={mutedColor(isDark)}
      style={{ typography: "titleMedium", fontWeight: "600" }}
    >
      {title}
    </Text>
  );
}

export function ProfileNativeList({
  isDark,
  backgroundColor,
  profile,
  organizations,
  onOpenPlanifications,
  actions,
}: ProfileNativeListProps) {
  return (
    <Host
      style={[styles.host, { backgroundColor }]}
      colorScheme={isDark ? "dark" : "light"}
      useViewportSizeMeasurement
    >
      <LazyColumn
        contentPadding={{ start: 24, top: 96, end: 24, bottom: 40 }}
        verticalArrangement={{ spacedBy: 12 }}
      >
        <ProfileHeader profile={profile} isDark={isDark} />

        <Column verticalArrangement={{ spacedBy: 8 }}>
          <NativeRow
            title="Planificaciones"
            isDark={isDark}
            onPress={onOpenPlanifications}
          />
        </Column>

        {organizations.isLoaded && organizations.hasMultipleOrganizations ? (
          <Column verticalArrangement={{ spacedBy: 8 }}>
            <SectionHeader title="Cambiar organización" isDark={isDark} />
            {organizations.orgError ? (
              <Text
                color={mutedColor(isDark)}
                style={{ typography: "bodyMedium" }}
              >
                {organizations.orgError}
              </Text>
            ) : null}
            {organizations.memberships.map((membership, index) => {
              const isCurrent =
                membership.organizationId === organizations.activeOrgId;
              const isSwitching =
                membership.organizationId === organizations.switchingOrgId;

              return (
                <NativeRow
                  key={`${membership.organizationId}-${index}`}
                  title={`${membership.organizationName}${isCurrent ? " (actual)" : ""}${isSwitching ? "..." : ""}`}
                  isDark={isDark}
                  onPress={
                    isCurrent || organizations.switchingOrgId
                      ? undefined
                      : () => organizations.onSwitch(membership.organizationId)
                  }
                />
              );
            })}
          </Column>
        ) : null}

        <Column verticalArrangement={{ spacedBy: 8 }}>
          <SectionHeader title="Ajustes" isDark={isDark} />
          <NativeRow
            title="Información personal"
            isDark={isDark}
            onPress={actions.onEditPersonalInfo}
          />
          <NativeRow
            title="Información física"
            isDark={isDark}
            onPress={actions.onEditPhysicalInfo}
          />
        </Column>

        <Column verticalArrangement={{ spacedBy: 8 }}>
          <SectionHeader title="Cuenta" isDark={isDark} />
          <NativeRow
            title="Cerrar sesión"
            isDark={isDark}
            onPress={actions.onSignOut}
          />
        </Column>

        <Column verticalArrangement={{ spacedBy: 8 }}>
          <SectionHeader title="Zona peligrosa" isDark={isDark} />
          <NativeRow
            title="Eliminar cuenta permanentemente"
            isDark={isDark}
            textColorOverride={DANGER_COLOR}
            rowColorOverride={backgroundColor}
            showTrailing={false}
            onPress={actions.onDeleteAccount}
          />
        </Column>
      </LazyColumn>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    paddingVertical: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarPlaceholderText: {
    fontSize: 24,
    fontWeight: "600",
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  profileSubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
});
