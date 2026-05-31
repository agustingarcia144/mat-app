import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { format, parse } from "date-fns";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Colors } from "@/constants/theme";

export default function EditTransactionScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();

  const transactions = useQuery(api.finance.getTransactions, {});
  const updateTransaction = useMutation(api.finance.updateTransaction);
  const voidTransaction = useMutation(api.finance.voidTransaction);

  const tx = transactions?.find((t: any) => t._id === transactionId);
  const isVoided = tx?.voidedAt != null;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (tx && !initialized) {
      setTitle(tx.title ?? "");
      setCategory(tx.category ?? "");
      setAmountStr(tx.amountArs != null ? String(tx.amountArs) : "");
      setOccurredOn(
        tx.occurredOn
          ? parse(tx.occurredOn, "yyyy-MM-dd", new Date())
          : new Date(),
      );
      setPaymentMethod(tx.paymentMethod ?? "cash");
      setNotes(tx.notes ?? "");
      setInitialized(true);
    }
  }, [tx, initialized]);

  const isDirty =
    initialized &&
    tx &&
    (title !== (tx.title ?? "") ||
      category !== (tx.category ?? "") ||
      amountStr !== String(tx.amountArs ?? "") ||
      notes !== (tx.notes ?? ""));

  useUnsavedChangesGuard(!!isDirty && !saving);

  const onSave = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Ingresá un título.");
      return;
    }
    setSaving(true);
    try {
      await updateTransaction({
        transactionId: transactionId as any,
        title: title.trim(),
        category: category.trim() || undefined,
        amountArs: amountStr ? Number(amountStr) : undefined,
        occurredOn: format(occurredOn, "yyyy-MM-dd"),
        paymentMethod: paymentMethod as any,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo actualizar.");
    } finally {
      setSaving(false);
    }
  };

  const onVoid = () => {
    Alert.alert("Anular transacción", "Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Anular",
        style: "destructive",
        onPress: async () => {
          try {
            await voidTransaction({ transactionId: transactionId as any });
            router.back();
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "No se pudo anular.");
          }
        },
      },
    ]);
  };

  if (!tx) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

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
          title: tx.title,
          headerRight: () =>
            !isVoided ? (
              <View style={styles.headerActions}>
                <ThemedPressable onPress={onVoid} style={styles.iconBtn}>
                  <MaterialIcons name="block" size={20} color="#ef4444" />
                </ThemedPressable>
                <ThemedPressable
                  type="primary"
                  lightColor="#000"
                  darkColor="#fff"
                  style={styles.saveBtn}
                  onPress={onSave}
                  disabled={saving || !isDirty}
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
              </View>
            ) : null,
        }}
      />
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {isVoided ? (
            <View style={styles.voidedBanner}>
              <ThemedText style={styles.voidedText}>
                Esta transacción fue anulada.
              </ThemedText>
            </View>
          ) : null}

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Título
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
              editable={!isVoided}
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
              editable={!isVoided}
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Monto (ARS)
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="numeric"
              editable={!isVoided}
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Fecha
            </ThemedText>
            <ThemedPressable
              style={[inputStyle, styles.dateBtn]}
              onPress={() => !isVoided && setShowDatePicker(true)}
              disabled={isVoided}
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
                onValueChange={setPaymentMethod}
                enabled={!isVoided}
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
              multiline
              numberOfLines={3}
              editable={!isVoided}
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
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
  voidedBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    padding: 12,
    borderRadius: 12,
  },
  voidedText: { color: "#ef4444", fontSize: 14, fontWeight: "500", textAlign: "center" },
});
