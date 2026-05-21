import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Host, ListItem, Text } from "@expo/ui/jetpack-compose";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

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
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileHeader
          fullName={data.profile.displayName}
          email={data.profile.primaryEmail}
          imageUrl={data.profile.imageUrl}
          initials={data.profile.initials}
          isDark={isDark}
        />

        <Section title="Organización" isDark={isDark}>
          <ComposeRow
            title={data.organization.name}
            subtitle={data.organization.roleLabel}
            icon="business"
            value={data.organization.isAdmin ? "Admin" : undefined}
            isDark={isDark}
          />
          {data.organization.isAdmin ? (
            <>
              <ComposeRow
                title="Editar organización"
                subtitle="Nombre, logo, dirección, teléfono y email"
                icon="edit"
                isDark={isDark}
                onPress={data.organizationEditor.onOpen}
              />
              <ComposeRow
                title="Configuración"
                subtitle="Módulos y registro de miembros"
                icon="settings"
                isDark={isDark}
                onPress={data.actions.openSettings}
              />
              <ComposeRow
                title="Usuarios"
                subtitle="Invitaciones y permisos del equipo"
                icon="group"
                isDark={isDark}
                onPress={data.actions.openUsers}
              />
            </>
          ) : null}
        </Section>

        <Section title="Módulos" isDark={isDark}>
          <ComposeRow
            title="Planificaciones"
            subtitle="Gestionar planificaciones de entrenamiento y asignaciones"
            icon="assignment"
            value={moduleStatus(data.orgSettings?.planificationsEnabled)}
            isDark={isDark}
            onPress={
              data.organization.isAdmin ? data.actions.openSettings : undefined
            }
          />
          <ComposeRow
            title="Clases"
            subtitle="Programar clases, reservas y asistencia"
            icon="event-available"
            value={moduleStatus(data.orgSettings?.classesEnabled)}
            isDark={isDark}
            onPress={
              data.organization.isAdmin ? data.actions.openSettings : undefined
            }
          />
          <ComposeRow
            title="Ingresos y egresos"
            subtitle="Seguimiento manual de ingresos y gastos"
            icon="account-balance"
            value={moduleStatus(data.orgSettings?.financeEnabled)}
            isDark={isDark}
            onPress={
              data.organization.isAdmin ? data.actions.openSettings : undefined
            }
          />
        </Section>

        <Section title="Registro de miembros" isDark={isDark}>
          <ComposeRow
            title="Aprobación automática"
            subtitle="Los miembros que escaneen el código QR se unen sin aprobación del admin"
            icon="qr-code-scanner"
            value={data.orgSettings?.memberAutoApproval ? "Activa" : "Inactiva"}
            isDark={isDark}
            onPress={
              data.organization.isAdmin ? data.actions.openSettings : undefined
            }
          />
        </Section>

        <Section title="Cuenta" isDark={isDark}>
          <ComposeRow
            title="Cambiar de organización"
            icon="swap-horiz"
            isDark={isDark}
            onPress={data.actions.onSwitchOrg}
          />
          <ComposeRow
            title="Cerrar sesión"
            icon="logout"
            isDark={isDark}
            onPress={data.actions.onSignOut}
            destructive
          />
        </Section>
      </ScrollView>

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

function ComposeRow({
  title,
  subtitle,
  icon,
  value,
  isDark,
  onPress,
  destructive,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value?: string;
  isDark: boolean;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const colors = {
    containerColor: isDark ? "#141414" : "#f4f4f5",
    contentColor: destructive ? "#ef4444" : isDark ? "#fff" : "#11181C",
    supportingContentColor: isDark ? "#a1a1aa" : "#71717a",
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [pressed && onPress ? { opacity: 0.65 } : null]}
    >
      <Host
        matchContents={{ vertical: true }}
        colorScheme={isDark ? "dark" : "light"}
      >
        <ListItem colors={colors}>
          <ListItem.LeadingContent>
            <MaterialIcons
              name={icon}
              size={22}
              color={destructive ? "#ef4444" : isDark ? "#fff" : "#11181C"}
            />
          </ListItem.LeadingContent>
          <ListItem.HeadlineContent>
            <Text>{title}</Text>
          </ListItem.HeadlineContent>
          {subtitle ? (
            <ListItem.SupportingContent>
              <Text>{subtitle}</Text>
            </ListItem.SupportingContent>
          ) : null}
          {value || onPress ? (
            <ListItem.TrailingContent>
              <View style={styles.trailing}>
                {value ? (
                  <ThemedText
                    style={[
                      styles.trailingText,
                      {
                        color: isDark
                          ? Colors.dark.subtle
                          : Colors.light.subtle,
                      },
                    ]}
                  >
                    {value}
                  </ThemedText>
                ) : null}
                {onPress ? (
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color={isDark ? Colors.dark.subtle : Colors.light.subtle}
                  />
                ) : null}
              </View>
            </ListItem.TrailingContent>
          ) : null}
        </ListItem>
      </Host>
    </Pressable>
  );
}

function Section({
  title,
  isDark,
  children,
}: {
  title: string;
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <ThemedText
        style={[
          styles.sectionTitle,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {title}
      </ThemedText>
      <View style={styles.sectionRows}>{children}</View>
    </View>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 20,
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
  section: {
    marginTop: 22,
    gap: 8,
  },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sectionRows: {
    overflow: "hidden",
    borderRadius: 18,
    gap: 1,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  trailingText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
