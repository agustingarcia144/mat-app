import React, { useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { Picker } from "@react-native-picker/picker";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Colors } from "@/constants/theme";

export default function RecordPaymentScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const subscriptions = useQuery(api.memberPlanSubscriptions.getByOrganization, {
    status: "active",
  });
  const recordPayment = useMutation(api.planPayments.recordPayment);

  const [subscriptionId, setSubscriptionId] = useState("");
  const [billingPeriod, setBillingPeriod] = useState(() =>
    format(new Date(), "yyyy-MM"),
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">(
    "cash",
  );
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isDirty = subscriptionId.length > 0 || notes.length > 0;
  useUnsavedChangesGuard(isDirty && !saving);

  const periodOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return format(d, "yyyy-MM");
    });
  }, []);

  const onSave = async () => {
    if (!subscriptionId) {
      Alert.alert("Error", "Seleccioná una suscripción.");
      return;
    }
    setSaving(true);
    try {
      await recordPayment({
        subscriptionId: subscriptionId as any,
        billingPeriod,
        paymentMethod,
        amountArs: amountStr ? Number(amountStr) : undefined,
        notes: notes || undefined,
      });
      Alert.alert("Registrado", "Pago registrado correctamente.");
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "No se pudo registrar el pago.");
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
      <View style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Suscripción *
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={subscriptionId}
                onValueChange={setSubscriptionId}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                <Picker.Item label="Seleccionar..." value="" />
                {(subscriptions ?? []).map((sub: any) => (
                  <Picker.Item
                    key={sub._id}
                    label={`${sub.userFullName ?? "—"} — ${sub.planName ?? sub._id}`}
                    value={sub._id}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Período de facturación
            </ThemedText>
            <View style={pickerStyle}>
              <Picker
                selectedValue={billingPeriod}
                onValueChange={setBillingPeriod}
                style={{ color: isDark ? "#fff" : "#000" }}
              >
                {periodOptions.map((p) => (
                  <Picker.Item key={p} label={p} value={p} />
                ))}
              </Picker>
            </View>
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
              </Picker>
            </View>
          </View>

          <View>
            <ThemedText type="defaultSemiBold" style={labelStyle}>
              Monto (ARS, opcional)
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

          <ThemedPressable
            type="primary"
            lightColor="#000"
            darkColor="#fff"
            style={styles.submitBtn}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={isDark ? "#000" : "#fff"} />
            ) : (
              <ThemedText
                type="defaultSemiBold"
                style={{ color: isDark ? "#000" : "#fff", fontSize: 16 }}
              >
                Registrar pago
              </ThemedText>
            )}
          </ThemedPressable>
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
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
  submitBtn: {
    height: 48,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
});
