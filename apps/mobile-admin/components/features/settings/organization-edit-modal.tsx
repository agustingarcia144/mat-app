import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { Colors } from "@/constants/theme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import type { OrganizationForm } from "./profile-settings-data";

export function OrganizationEditModal({
  visible,
  form,
  logoUrl,
  saving,
  isDark,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  form: OrganizationForm;
  logoUrl?: string | null;
  saving: boolean;
  isDark: boolean;
  onChange: (form: OrganizationForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const borderColor = isDark ? Colors.dark.border : Colors.light.border;
  const inputBg = isDark ? "#0a0a0a" : "#fff";
  const textColor = isDark ? Colors.dark.text : Colors.light.text;
  const subtleColor = isDark ? Colors.dark.subtle : Colors.light.subtle;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: isDark ? "#000" : "#fff", borderColor },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <ThemedText type="defaultSemiBold" style={styles.modalTitle}>
                Editar organización
              </ThemedText>
              <ThemedText
                style={[styles.modalSubtitle, { color: subtleColor }]}
              >
                Modifica la información de la organización.
              </ThemedText>
            </View>
            <ThemedPressable
              onPress={onClose}
              disabled={saving}
              style={styles.modalClose}
            >
              <MaterialIcons name="close" size={24} color={textColor} />
            </ThemedPressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalContent}
          >
            <InputGroup
              label="Nombre"
              value={form.name}
              onChangeText={(name) => onChange({ ...form, name })}
              isDark={isDark}
              editable={!saving}
            />

            <View style={styles.inputGroup}>
              <ThemedText type="defaultSemiBold" style={styles.inputLabel}>
                Logo
              </ThemedText>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
              ) : (
                <View
                  style={[
                    styles.logoPlaceholder,
                    { borderColor, backgroundColor: inputBg },
                  ]}
                >
                  <MaterialIcons name="image" size={24} color={subtleColor} />
                </View>
              )}
              <ThemedText style={[styles.helpText, { color: subtleColor }]}>
                La carga de logo se gestiona desde web por ahora.
              </ThemedText>
            </View>

            <InputGroup
              label="Dirección"
              value={form.address}
              onChangeText={(address) => onChange({ ...form, address })}
              isDark={isDark}
              editable={!saving}
            />
            <InputGroup
              label="Teléfono"
              value={form.phone}
              onChangeText={(phone) => onChange({ ...form, phone })}
              isDark={isDark}
              editable={!saving}
              keyboardType="phone-pad"
            />
            <InputGroup
              label="Email"
              value={form.email}
              onChangeText={(email) => onChange({ ...form, email })}
              isDark={isDark}
              editable={!saving}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <ThemedPressable
              onPress={onSave}
              disabled={saving}
              style={[
                styles.modalSaveButton,
                { backgroundColor: isDark ? "#fff" : "#000" },
                saving && { opacity: 0.6 },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={isDark ? "#000" : "#fff"} />
              ) : (
                <ThemedText
                  type="defaultSemiBold"
                  style={{ color: isDark ? "#000" : "#fff" }}
                >
                  Guardar cambios
                </ThemedText>
              )}
            </ThemedPressable>
            <ThemedPressable
              onPress={onClose}
              disabled={saving}
              style={[styles.modalCancelButton, { borderColor }]}
            >
              <ThemedText type="defaultSemiBold">Cancelar</ThemedText>
            </ThemedPressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InputGroup({
  label,
  value,
  onChangeText,
  isDark,
  editable,
  keyboardType,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  isDark: boolean;
  editable: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={styles.inputGroup}>
      <ThemedText type="defaultSemiBold" style={styles.inputLabel}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={isDark ? "#52525b" : "#a1a1aa"}
        style={[
          styles.input,
          {
            color: isDark ? "#fff" : "#000",
            borderColor: isDark ? Colors.dark.border : Colors.light.border,
            backgroundColor: isDark ? "#0a0a0a" : "#fff",
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: "88%",
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  modalHeaderText: {
    flex: 1,
    alignItems: "center",
    paddingLeft: 36,
  },
  modalTitle: {
    fontSize: 22,
    textAlign: "center",
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 14,
    textAlign: "center",
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 15,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  logoPreview: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  logoPlaceholder: {
    width: 76,
    height: 76,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  helpText: {
    fontSize: 12,
    lineHeight: 17,
  },
  modalSaveButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalCancelButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
