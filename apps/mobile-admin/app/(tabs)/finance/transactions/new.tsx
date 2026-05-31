import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { format } from "date-fns";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Colors } from "@/constants/theme";

export default function NewTransactionScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const createTransaction = useMutation(api.finance.createTransaction);

  const [type, setType] = useState<"income" | "expense">("income");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date());
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "bank_transfer" | "card" | "other"
  >("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isDirty = title.length > 0 || amountStr.length > 0;
  useUnsavedChangesGuard(isDirty && !saving);

  const onSave = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Ingresá un título.");
      return;
    }
    if (!amountStr || Number(amountStr) <= 0) {
      Alert.alert("Error", "Ingresá un monto válido.");
      return;
    }
    setSaving(true);
    try {
      await createTransaction({
        type,
        title: title.trim(),
        category: category.trim() || "General",
        amountArs: Number(amountStr),
        occurredOn: format(occurredOn, "yyyy-MM-dd"),
        paymentMethod,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo crear la transacción.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
      color: isDark ? "#fff" : "#000",
      borderColor: isDark ? Colors.dark.border : Colors.light.border,
    },
  ];

  const labelStyle = [
    styles.label,
    { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
  ];

  const pickerStyle = [
    styles.pickerWrapper,
    {
      backgroundColor: isDark ? Colors.dark.muted : "#f4f4f5",
      borderColor: isDark ? Colors.dark.border : Colors.light.border,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={styles.saveBtn}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={isDark ? "#000" : "#fff"} />
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Tipo
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={type}
                onValueChange={setType as any}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Ingreso" value="income" />
                <Picker.Item label="Egreso" value="expense" />
              </Picker>
            </View>
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Título *
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
              placeholder="Descripción del movimiento"
              placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Categoría
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={category}
              onChangeText={setCategory}
              placeholder="ej. Alquiler, Suministros..."
              placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Monto (ARS) *
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0"
              placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
              keyboardType="numeric"
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Fecha
            </ThemedText>
            <ThemedPressable
              style={[inputStyle, styles.dateBtn]}
              onPress={() => setShowDatePicker(true)}
            >
              <ThemedText>{format(occurredOn, "dd/MM/yyyy")}</ThemedText>
            </ThemedPressable>
            {showDatePicker ? (
              <DateTimePicker
                value={occurredOn}
                mode="date"
                display="default"
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) setOccurredOn(date);
                }}
              />
            ) : null}
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Método de pago
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={paymentMethod}
                onValueChange={setPaymentMethod as any}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Efectivo" value="cash" />
                <Picker.Item label="Transferencia" value="bank_transfer" />
                <Picker.Item label="Tarjeta" value="card" />
                <Picker.Item label="Otro" value="other" />
              </Picker>
            </View>
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Notas
            </ThemedText>
            <TextInput
              style={[...inputStyle, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notas opcionales..."
              placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
              multiline
              numberOfLines={3}
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
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    minHeight: 36,
  },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  multiline: { height: 80, paddingTop: 12, textAlignVertical: "top" },
  pickerWrapper: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  dateBtn: { justifyContent: "center" },
});
