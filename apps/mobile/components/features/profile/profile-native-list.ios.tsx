import React from "react";
import { Image, StyleSheet, Text as RNText, View } from "react-native";
import { Host, List, RNHostView, Section, Text } from "@expo/ui/swift-ui";
import {
  background as swiftBackground,
  font,
  foregroundStyle,
  listRowBackground,
  listRowSeparator,
  listStyle,
  onTapGesture,
  scrollContentBackground,
} from "@expo/ui/swift-ui/modifiers";
import type { ProfileNativeListProps } from "./profile-native-list.types";

const DANGER_COLOR = "#ef4444";

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
        <RNText
          style={[styles.profileTitle, { color: isDark ? "#fff" : "#000" }]}
        >
          {profile.fullName}
        </RNText>
        {profile.primaryEmail ? (
          <RNText
            style={[
              styles.profileSubtitle,
              { color: isDark ? "#a1a1aa" : "#71717a" },
            ]}
          >
            {profile.primaryEmail}
          </RNText>
        ) : null}
      </View>
    </RNHostView>
  );
}

function NativeActionRow({
  title,
  onPress,
  isDark,
  textColor,
  rowBackgroundColor,
}: {
  title: string;
  onPress?: () => void;
  isDark: boolean;
  textColor?: string;
  rowBackgroundColor?: string;
}) {
  return (
    <Text
      modifiers={[
        font({ size: 17 }),
        foregroundStyle(textColor ?? (isDark ? "#fff" : "#000")),
        ...(rowBackgroundColor
          ? [listRowBackground(rowBackgroundColor), listRowSeparator("hidden")]
          : []),
        ...(onPress ? [onTapGesture(onPress)] : []),
      ]}
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
      <List
        modifiers={[
          listStyle("insetGrouped"),
          scrollContentBackground("hidden"),
          swiftBackground(backgroundColor),
        ]}
      >
        <Section>
          <ProfileHeader profile={profile} isDark={isDark} />
        </Section>

        <Section>
          <NativeActionRow
            title="Planificaciones"
            isDark={isDark}
            onPress={onOpenPlanifications}
          />
        </Section>

        {organizations.isLoaded && organizations.hasMultipleOrganizations ? (
          <Section title="Cambiar organización">
            {organizations.orgError ? (
              <Text
                modifiers={[
                  font({ size: 14 }),
                  foregroundStyle(isDark ? "#a1a1aa" : "#71717a"),
                ]}
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
                <NativeActionRow
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
          </Section>
        ) : null}

        <Section title="Ajustes">
          <NativeActionRow
            title="Información personal"
            isDark={isDark}
            onPress={actions.onEditPersonalInfo}
          />
          <NativeActionRow
            title="Información física"
            isDark={isDark}
            onPress={actions.onEditPhysicalInfo}
          />
        </Section>

        <Section title="Cuenta">
          <NativeActionRow
            title="Cerrar sesión"
            isDark={isDark}
            onPress={actions.onSignOut}
          />
        </Section>

        <Section title="Zona peligrosa">
          <NativeActionRow
            title="Eliminar cuenta permanentemente"
            isDark={isDark}
            textColor={DANGER_COLOR}
            rowBackgroundColor={backgroundColor}
            onPress={actions.onDeleteAccount}
          />
        </Section>
      </List>
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
