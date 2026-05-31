import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { getOrgRoleLabel } from "@/lib/security/roles";

type InvitationRowProps = {
  email: string;
  role: string;
  onRevoke: () => void;
};

export function InvitationRow({ email, role, onRevoke }: InvitationRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const confirmRevoke = () => {
    Alert.alert(
      "Revocar invitación",
      `¿Revocar la invitación a ${email}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Revocar", style: "destructive", onPress: onRevoke },
      ],
    );
  };

  return (
    <View
      style={[
        styles.row,
        {
          borderColor: isDark ? Colors.dark.border : Colors.light.border,
          backgroundColor: isDark ? Colors.dark.muted : "#fff",
        },
      ]}
    >
      <View style={styles.info}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {email}
        </ThemedText>
        <ThemedText
          style={[
            styles.role,
            { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
          ]}
        >
          {getOrgRoleLabel(role)} · Pendiente
        </ThemedText>
      </View>
      <ThemedPressable onPress={confirmRevoke} style={styles.trashBtn}>
        <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
      </ThemedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
  },
  info: { flex: 1 },
  role: { fontSize: 12, marginTop: 2 },
  trashBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
