import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import {
  Button,
  Host,
  Label,
  LabeledContent,
  List,
  Section,
  Text,
} from "@expo/ui/swift-ui";
import { font, foregroundStyle, listStyle } from "@expo/ui/swift-ui/modifiers";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { OrganizationEditModal } from "@/components/features/settings/organization-edit-modal";
import {
  moduleStatus,
  useProfileSettingsData,
} from "@/components/features/settings/profile-settings-data";

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const data = useProfileSettingsData();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: "Configuración" }} />
      <ProfileHeader
        fullName={data.profile.displayName}
        email={data.profile.primaryEmail}
        imageUrl={data.profile.imageUrl}
        initials={data.profile.initials}
        isDark={isDark}
      />

      <Host style={styles.listHost}>
        <List modifiers={[listStyle("insetGrouped")]}>
          <Section title="Organización">
            <LabeledContent
              label={
                <Label
                  title={data.organization.name}
                  systemImage={"building.2" as any}
                />
              }
            >
              <Text>
                {data.organization.isAdmin
                  ? "Admin"
                  : data.organization.roleLabel}
              </Text>
            </LabeledContent>

            {data.organization.isAdmin ? (
              <>
                <SettingsButton
                  title="Editar organización"
                  systemImage="pencil"
                  onPress={data.organizationEditor.onOpen}
                />
                <SettingsButton
                  title="Configuración"
                  systemImage="gearshape"
                  onPress={data.actions.openSettings}
                />
                <SettingsButton
                  title="Usuarios"
                  systemImage="person.2"
                  onPress={data.actions.openUsers}
                />
              </>
            ) : null}
          </Section>

          <Section title="Módulos">
            <ValueRow
              title="Planificaciones"
              systemImage="clipboard"
              value={moduleStatus(data.orgSettings?.planificationsEnabled)}
            />
            <ValueRow
              title="Clases"
              systemImage="calendar.badge.clock"
              value={moduleStatus(data.orgSettings?.classesEnabled)}
            />
            <ValueRow
              title="Ingresos y egresos"
              systemImage="banknote"
              value={moduleStatus(data.orgSettings?.financeEnabled)}
            />
          </Section>

          <Section title="Registro de miembros">
            <ValueRow
              title="Aprobación automática"
              systemImage="qrcode.viewfinder"
              value={
                data.orgSettings?.memberAutoApproval ? "Activa" : "Inactiva"
              }
            />
          </Section>

          <Section title="Cuenta">
            <SettingsButton
              title="Cambiar de organización"
              systemImage="arrow.triangle.2.circlepath"
              onPress={data.actions.onSwitchOrg}
            />
            <SettingsButton
              title="Cerrar sesión"
              systemImage="rectangle.portrait.and.arrow.right"
              onPress={data.actions.onSignOut}
              destructive
            />
          </Section>
        </List>
      </Host>

      <OrganizationEditModal
        visible={data.organizationEditor.visible}
        form={data.organizationEditor.form}
        logoUrl={data.organizationEditor.logoUrl}
        saving={data.organizationEditor.saving}
        isDark={isDark}
        onChange={data.organizationEditor.onChange}
        onClose={data.organizationEditor.onClose}
        onSave={data.organizationEditor.onSave}
      />
    </ThemedView>
  );
}

function SettingsButton({
  title,
  systemImage,
  onPress,
  destructive,
}: {
  title: string;
  systemImage: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Button
      label={title}
      systemImage={systemImage as any}
      role={destructive ? "destructive" : "default"}
      onPress={onPress}
    />
  );
}

function ValueRow({
  title,
  systemImage,
  value,
}: {
  title: string;
  systemImage: string;
  value: string;
}) {
  return (
    <LabeledContent
      label={<Label title={title} systemImage={systemImage as any} />}
    >
      <Text
        modifiers={[
          foregroundStyle({ type: "hierarchical", style: "secondary" }),
          font({ weight: "semibold" }),
        ]}
      >
        {value}
      </Text>
    </LabeledContent>
  );
}

function ProfileHeader({
  fullName,
  email,
  imageUrl,
  initials,
  isDark,
}: {
  fullName: string;
  email?: string;
  imageUrl?: string;
  initials: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.profileHeader}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatar} />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.08)",
            },
          ]}
        >
          <ThemedText style={styles.avatarText}>{initials}</ThemedText>
        </View>
      )}
      <ThemedText type="defaultSemiBold" style={styles.profileName}>
        {fullName}
      </ThemedText>
      {email ? (
        <ThemedText
          style={[
            styles.profileEmail,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
          numberOfLines={1}
        >
          {email}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 14,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
  },
  profileName: {
    maxWidth: "100%",
    fontSize: 22,
    textAlign: "center",
  },
  profileEmail: {
    maxWidth: "100%",
    marginTop: 5,
    fontSize: 14,
    textAlign: "center",
  },
  listHost: {
    flex: 1,
  },
});
