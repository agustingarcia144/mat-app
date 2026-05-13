import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex";
import { useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Colors } from "@/constants/theme";

export default function InviteUserScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const createInvitation = useMutation(api.organizations.createInvitation);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("trainer");
  const [sending, setSending] = useState(false);

  const isDirty = email.trim().length > 0;
  useUnsavedChangesGuard(isDirty && !sending);

  const onSend = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Error", "Ingresá un correo electrónico.");
      return;
    }
    setSending(true);
    try {
      await createInvitation({ email: trimmed, role });
      Alert.alert("Enviada", `Invitación enviada a ${trimmed}.`);
      router.back();
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message ?? "No se pudo enviar la invitación.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safe}>
        <View style={styles.form}>
          <View>
            <ThemedText
              type="defaultSemiBold"
              style={[
                styles.label,
                { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
              ]}
            >
              Correo electrónico
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
                  color: isDark ? "#fff" : "#000",
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
              placeholder="email@ejemplo.com"
              placeholderTextColor={
                isDark ? Colors.dark.subtle : Colors.light.subtle
              }
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!sending}
            />
          </View>

          <View>
            <ThemedText
              type="defaultSemiBold"
              style={[
                styles.label,
                { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
              ]}
            >
              Rol
            </ThemedText>
            <View
              style={[
                styles.pickerWrapper,
                {
                  backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
            >
              <Picker
                selectedValue={role}
                onValueChange={setRole}
                enabled={!sending}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Entrenador" value="trainer" />
                <Picker.Item label="Administrador" value="admin" />
              </Picker>
            </View>
          </View>

          <ThemedPressable
            type="primary"
            lightColor="#000"
            darkColor="#fff"
            style={styles.sendBtn}
            onPress={onSend}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color={isDark ? "#000" : "#fff"} />
            ) : (
              <ThemedText
                type="defaultSemiBold"
                style={{ color: isDark ? "#000" : "#fff", fontSize: 16 }}
              >
                Enviar invitación
              </ThemedText>
            )}
          </ThemedPressable>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  form: { padding: 20, gap: 20 },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  pickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  sendBtn: {
    height: 48,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
});
