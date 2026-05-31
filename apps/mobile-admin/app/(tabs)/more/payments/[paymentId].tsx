import React, { useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { PaymentStatusPill } from "@/components/features/payments/payment-status-pill";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export default function PaymentDetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();

  const allPayments = useQuery(api.planPayments.getByOrganization, {});
  const pendingPayments = useQuery(api.planPayments.getPendingByOrganization);
  const proofData = useQuery(api.planPayments.getProofUrl, {
    paymentId: paymentId as any,
  });
  const approvePayment = useMutation(api.planPayments.approve);
  const declinePayment = useMutation(api.planPayments.decline);

  const payment =
    allPayments?.find((p: any) => p._id === paymentId) ??
    pendingPayments?.find((p: any) => p._id === paymentId);

  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState(false);

  const canReview =
    payment?.status === "in_review" || payment?.status === "pending";

  const onApprove = () => {
    Alert.alert("Aprobar pago", "¿Confirmar aprobación?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Aprobar",
        onPress: async () => {
          setActing(true);
          try {
            await approvePayment({
              paymentId: paymentId as any,
              notes: notes || undefined,
            });
            router.back();
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "No se pudo aprobar.");
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  const onDecline = () => {
    Alert.alert("Rechazar pago", "¿Confirmar rechazo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Rechazar",
        style: "destructive",
        onPress: async () => {
          setActing(true);
          try {
            await declinePayment({
              paymentId: paymentId as any,
              notes: notes || undefined,
            });
            router.back();
          } catch (err: any) {
            Alert.alert("Error", err?.message ?? "No se pudo rechazar.");
          } finally {
            setActing(false);
          }
        },
      },
    ]);
  };

  if (!payment) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
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
            <InfoRow
              label="Miembro"
              value={payment.userFullName ?? payment.userName ?? "—"}
              isDark={isDark}
            />
            <InfoRow
              label="Plan"
              value={payment.planName ?? "—"}
              isDark={isDark}
            />
            <InfoRow
              label="Período"
              value={payment.billingPeriod ?? "—"}
              isDark={isDark}
            />
            <InfoRow
              label="Monto"
              value={
                payment.payableAmountArs != null
                  ? `$${payment.payableAmountArs.toLocaleString("es-AR")}`
                  : "—"
              }
              isDark={isDark}
            />
            <View style={styles.infoRow}>
              <ThemedText
                style={[
                  styles.infoLabel,
                  {
                    color: isDark
                      ? Colors.dark.subtle
                      : Colors.light.subtle,
                  },
                ]}
              >
                Estado
              </ThemedText>
              <PaymentStatusPill status={payment.status} />
            </View>
          </View>

          {proofData?.url ? (
            <View>
              <ThemedText type="defaultSemiBold" style={styles.sectionLabel}>
                Comprobante
              </ThemedText>
              <Image
                source={{ uri: proofData.url }}
                style={styles.proofImage}
                contentFit="contain"
              />
            </View>
          ) : null}

          {canReview ? (
            <>
              <View>
                <ThemedText type="defaultSemiBold" style={styles.sectionLabel}>
                  Notas de revisión
                </ThemedText>
                <TextInput
                  style={[
                    styles.notesInput,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.muted
                        : "#f4f4f5",
                      color: isDark ? "#fff" : "#000",
                      borderColor: isDark
                        ? Colors.dark.border
                        : Colors.light.border,
                    },
                  ]}
                  placeholder="Notas opcionales..."
                  placeholderTextColor={
                    isDark ? Colors.dark.subtle : Colors.light.subtle
                  }
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.actionRow}>
                <ThemedPressable
                  type="destructive"
                  style={styles.actionBtn}
                  onPress={onDecline}
                  disabled={acting}
                >
                  <ThemedText
                    type="defaultSemiBold"
                    lightColor="#fff"
                    darkColor="#fff"
                    style={styles.actionText}
                  >
                    Rechazar
                  </ThemedText>
                </ThemedPressable>
                <ThemedPressable
                  type="primary"
                  lightColor="#16a34a"
                  darkColor="#22c55e"
                  style={styles.actionBtn}
                  onPress={onApprove}
                  disabled={acting}
                >
                  {acting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <ThemedText
                      type="defaultSemiBold"
                      lightColor="#fff"
                      darkColor="#fff"
                      style={styles.actionText}
                    >
                      Aprobar
                    </ThemedText>
                  )}
                </ThemedPressable>
              </View>
            </>
          ) : null}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

function InfoRow({
  label,
  value,
  isDark,
}: {
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <ThemedText
        style={[
          styles.infoLabel,
          { color: isDark ? Colors.dark.subtle : Colors.light.subtle },
        ]}
      >
        {label}
      </ThemedText>
      <ThemedText style={styles.infoValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 16, paddingVertical: 4 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14, fontWeight: "500", textAlign: "right", flexShrink: 1 },
  sectionLabel: { fontSize: 14, marginBottom: 8 },
  proofImage: { width: "100%", height: 300, borderRadius: 12 },
  notesInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: { fontSize: 15 },
});
