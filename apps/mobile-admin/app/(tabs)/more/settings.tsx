import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { SettingRow } from "@/components/features/settings/setting-row";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { isOrgAdminRole } from "@/lib/security/roles";
import { Colors } from "@/constants/theme";

type SettingsState = {
  planificationsEnabled: boolean;
  classesEnabled: boolean;
  financeEnabled: boolean;
  memberAutoApproval: boolean;
};

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const membership = useCurrentMembership();
  const orgSettings = useOrgSettings();
  const updateSettings = useMutation(api.organizationSettings.update);

  const [local, setLocal] = useState<SettingsState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgSettings && !local) {
      setLocal({
        planificationsEnabled: orgSettings.planificationsEnabled !== false,
        classesEnabled: orgSettings.classesEnabled !== false,
        financeEnabled: orgSettings.financeEnabled !== false,
        memberAutoApproval: orgSettings.memberAutoApproval === true,
      });
    }
  }, [orgSettings, local]);

  const isDirty =
    local != null &&
    orgSettings != null &&
    (local.planificationsEnabled !==
      (orgSettings.planificationsEnabled !== false) ||
      local.classesEnabled !== (orgSettings.classesEnabled !== false) ||
      local.financeEnabled !== (orgSettings.financeEnabled !== false) ||
      local.memberAutoApproval !== (orgSettings.memberAutoApproval === true));

  useUnsavedChangesGuard(isDirty);

  if (!isOrgAdminRole(membership?.role)) {
    router.replace("/(tabs)/more" as any);
    return null;
  }

  const onSave = async () => {
    if (!local) return;
    setSaving(true);
    try {
      await updateSettings(local);
      Alert.alert("Guardado", "Configuración actualizada correctamente.");
    } catch {
      Alert.alert("Error", "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (!orgSettings || !local) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
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
              style={[styles.saveBtn, !isDirty && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={!isDirty || saving}
            >
              {saving ? (
                <ActivityIndicator
                  size="small"
                  color={isDark ? "#000" : "#fff"}
                />
              ) : (
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: isDark ? "#000" : "#fff", fontSize: 14 }}
                >
                  Guardar
                </ThemedText>
              )}
            </ThemedPressable>
          ),
        }}
      />
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[
              styles.card,
              {
                borderColor: isDark
                  ? Colors.dark.border
                  : Colors.light.border,
                backgroundColor: isDark ? Colors.dark.muted : "#fff",
              },
            ]}
          >
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Módulos
            </ThemedText>
            <SettingRow
              label="Planificaciones"
              description="Habilitar el módulo de planificaciones y ejercicios."
              value={local.planificationsEnabled}
              onValueChange={(v) =>
                setLocal({ ...local, planificationsEnabled: v })
              }
            />
            <SettingRow
              label="Clases"
              description="Habilitar el módulo de clases y turnos."
              value={local.classesEnabled}
              onValueChange={(v) => setLocal({ ...local, classesEnabled: v })}
            />
            <SettingRow
              label="Ingresos y egresos"
              description="Habilitar el módulo de finanzas."
              value={local.financeEnabled}
              onValueChange={(v) => setLocal({ ...local, financeEnabled: v })}
            />
          </View>

          <View
            style={[
              styles.card,
              {
                borderColor: isDark
                  ? Colors.dark.border
                  : Colors.light.border,
                backgroundColor: isDark ? Colors.dark.muted : "#fff",
              },
            ]}
          >
            <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
              Registro de miembros
            </ThemedText>
            <SettingRow
              label="Aprobación automática"
              description="Aprobar automáticamente a nuevos miembros que se registren por QR."
              value={local.memberAutoApproval}
              onValueChange={(v) =>
                setLocal({ ...local, memberAutoApproval: v })
              }
            />
          </View>
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    minHeight: 36,
  },
  saveBtnDisabled: { opacity: 0.4 },
  content: { padding: 20, gap: 16 },
  card: { borderWidth: 1, borderRadius: 16, paddingVertical: 4 },
  sectionTitle: { fontSize: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
});
