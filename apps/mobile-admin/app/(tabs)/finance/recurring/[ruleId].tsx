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
import { Picker } from "@react-native-picker/picker";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Colors } from "@/constants/theme";

export default function EditRecurringRuleScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { ruleId } = useLocalSearchParams<{ ruleId: string }>();

  const rules = useQuery(api.finance.getRecurringRules, {});
  const updateRule = useMutation(api.finance.updateRecurringRule);
  const pauseRule = useMutation(api.finance.pauseRecurringRule);
  const resumeRule = useMutation(api.finance.resumeRecurringRule);
  const cancelRule = useMutation(api.finance.cancelRecurringRule);

  const rule = rules?.find((r: any) => r._id === ruleId);
  const isCancelled = rule?.status === "cancelled";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [endPeriod, setEndPeriod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (rule && !initialized) {
      setTitle(rule.title ?? "");
      setCategory(rule.category ?? "");
      setAmountStr(rule.amountArs != null ? String(rule.amountArs) : "");
      setDayOfMonth(rule.dayOfMonth ?? 1);
      setEndPeriod(rule.endPeriod ?? "");
      setPaymentMethod(rule.paymentMethod ?? "cash");
      setNotes(rule.notes ?? "");
      setInitialized(true);
    }
  }, [rule, initialized]);

  const isDirty =
    initialized &&
    rule &&
    (title !== (rule.title ?? "") ||
      category !== (rule.category ?? "") ||
      amountStr !== String(rule.amountArs ?? "") ||
      notes !== (rule.notes ?? ""));

  useUnsavedChangesGuard(!!isDirty && !saving);

  const onSave = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Ingresá un título.");
      return;
    }
    setSaving(true);
    try {
      await updateRule({
        ruleId: ruleId as any,
        title: title.trim(),
        category: category.trim() || undefined,
        amountArs: amountStr ? Number(amountStr) : undefined,
        dayOfMonth,
        endPeriod: endPeriod || undefined,
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

  const onPause = () => {
    Alert.alert("Pausar regla", "¿Pausar esta regla recurrente?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Pausar",
        onPress: async () => {
          await pauseRule({ ruleId: ruleId as any });
        },
      },
    ]);
  };

  const onResume = () => {
    Alert.alert("Reanudar regla", "¿Reanudar esta regla recurrente?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Reanudar",
        onPress: async () => {
          await resumeRule({ ruleId: ruleId as any });
        },
      },
    ]);
  };

  const onCancel = () => {
    Alert.alert("Cancelar regla", "Esta acción no se puede deshacer.", [
      { text: "No", style: "cancel" },
      {
        text: "Cancelar regla",
        style: "destructive",
        onPress: async () => {
          await cancelRule({ ruleId: ruleId as any });
          router.back();
        },
      },
    ]);
  };

  if (!rule) {
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
          title: rule.title,
          headerRight: () =>
            !isCancelled ? (
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
            ) : null,
        }}
      />
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Título
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={title}
              onChangeText={setTitle}
              editable={!isCancelled}
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
              editable={!isCancelled}
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
              editable={!isCancelled}
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Día del mes
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={dayOfMonth}
                onValueChange={setDayOfMonth as any}
                enabled={!isCancelled}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <Picker.Item key={d} label={String(d)} value={d} />
                ))}
              </Picker>
            </View>
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Período de fin
            </ThemedText>
            <TextInput
              style={inputStyle}
              value={endPeriod}
              onChangeText={setEndPeriod}
              placeholder="YYYY-MM (vacío = sin fin)"
              placeholderTextColor={isDark ? Colors.dark.subtle : Colors.light.subtle}
              editable={!isCancelled}
              autoCapitalize="none"
            />
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Método de pago
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={paymentMethod}
                onValueChange={setPaymentMethod}
                enabled={!isCancelled}
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
              editable={!isCancelled}
            />
          </View>

          {!isCancelled ? (
            <View style={styles.actionRow}>
              {rule.status === "active" ? (
                <ThemedPressable
                  type="secondary"
                  lightColor="#fef3c7"
                  darkColor="rgba(245,158,11,0.2)"
                  style={[
                    styles.actionBtn,
                    { borderColor: isDark ? "#92400e" : "#fbbf24" },
                  ]}
                  onPress={onPause}
                >
                  <ThemedText
                    type="defaultSemiBold"
                    style={{ color: "#f59e0b", fontSize: 14 }}
                  >
                    Pausar
                  </ThemedText>
                </ThemedPressable>
              ) : rule.status === "paused" ? (
                <ThemedPressable
                  type="secondary"
                  lightColor="#dcfce7"
                  darkColor="rgba(34,197,94,0.2)"
                  style={[
                    styles.actionBtn,
                    { borderColor: isDark ? "#166534" : "#86efac" },
                  ]}
                  onPress={onResume}
                >
                  <ThemedText
                    type="defaultSemiBold"
                    style={{ color: "#22c55e", fontSize: 14 }}
                  >
                    Reanudar
                  </ThemedText>
                </ThemedPressable>
              ) : null}
              <ThemedPressable
                type="destructive"
                style={styles.actionBtn}
                onPress={onCancel}
              >
                <ThemedText
                  type="defaultSemiBold"
                  lightColor="#fff"
                  darkColor="#fff"
                  style={{ fontSize: 14 }}
                >
                  Cancelar regla
                </ThemedText>
              </ThemedPressable>
            </View>
          ) : null}
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
  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
