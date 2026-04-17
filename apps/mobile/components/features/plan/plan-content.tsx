import React from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import PlanSelector from "./plan-selector";
import PlanStatusCard from "./plan-status-card";
import PaymentStatusCard from "./payment-status-card";

export default function PlanContent() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();

  const subscription = useQuery(api.memberPlanSubscriptions.getMySubscription);
  const monthlyUsage = useQuery(api.classReservations.getMyMonthlyClassUsage, {});
  const currentPayment = useQuery(api.planPayments.getMyCurrentPeriodPayment);
  const bonification = useQuery(api.planBonifications.getMyActiveBonification);
  const cancelSubscription = useMutation(api.memberPlanSubscriptions.cancel);

  const BONIFICATION_REASON_LABELS: Record<string, string> = {
    friend_and_family: "Familiar/Amigo",
    trainer: "Entrenador",
    employee: "Empleado",
    sponsor: "Sponsor",
    other: "Otro",
  };

  const handleCancel = () => {
    const message = bonification
      ? "¿Estás seguro de que querés cancelar tu plan? Perderás el acceso a las clases y tu bonificación será revocada."
      : "¿Estás seguro de que querés cancelar tu plan? Perderás el acceso a las clases.";
    Alert.alert("Cancelar plan", message, [
      { text: "No", style: "cancel" },
      {
        text: "Sí, cancelar",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelSubscription({});
          } catch (err) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Error al cancelar",
            );
          }
        },
      },
    ]);
  };

  if (subscription === undefined) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </ThemedView>
    );
  }

  // No subscription — show plan selector
  if (!subscription) {
    return <PlanSelector />;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText type="title" style={styles.title}>
          Mi Plan
        </ThemedText>

        {/* Plan info + monthly class usage */}
        <PlanStatusCard
          plan={subscription.plan}
          status={subscription.status}
          monthlyUsed={monthlyUsage?.used ?? 0}
          monthlyLimit={monthlyUsage?.limit ?? 0}
        />

        {/* Bonification banner */}
        {bonification && (
          <View
            style={[
              styles.bonificationBanner,
              { backgroundColor: isDark ? "#2d1b4e" : "#f3e8ff" },
            ]}
          >
            <Text
              style={[
                styles.bonificationTitle,
                { color: isDark ? "#c084fc" : "#7c3aed" },
              ]}
            >
              Plan bonificado
            </Text>
            <Text
              style={[
                styles.bonificationDetail,
                { color: isDark ? "#d8b4fe" : "#6b21a8" },
              ]}
            >
              {bonification.discountType === "full"
                ? "100% gratis"
                : bonification.discountType === "percentage"
                  ? `${bonification.discountValue}% de descuento`
                  : `$${bonification.discountValue.toLocaleString("es-AR")} de descuento`}
              {" · "}
              {BONIFICATION_REASON_LABELS[bonification.reason] ??
                bonification.reason}
            </Text>
            <Text
              style={[
                styles.bonificationCreatedBy,
                { color: isDark ? "#a78bfa" : "#8b5cf6" },
              ]}
            >
              Otorgada por {bonification.createdByName}
            </Text>
          </View>
        )}

        {/* Current period payment */}
        <PaymentStatusCard
          payment={currentPayment}
          onUploadPress={() =>
            router.push({
              pathname: "/(tabs)/plan/upload-proof",
              params: { paymentId: currentPayment?._id ?? "" },
            })
          }
        />

        {/* Actions */}
        <View style={styles.actions}>
          <ThemedPressable
            type="secondary"
            style={styles.actionButton}
            onPress={() => router.push("/(tabs)/plan/payment-history")}
          >
            <Text
              style={[styles.actionText, { color: isDark ? "#fff" : "#000" }]}
            >
              Historial de pagos
            </Text>
          </ThemedPressable>

          <ThemedPressable
            type="destructive"
            style={styles.actionButton}
            onPress={handleCancel}
          >
            <ThemedText style={styles.destructiveText}>
              Cancelar plan
            </ThemedText>
          </ThemedPressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
  title: {
    marginBottom: 4,
  },
  bonificationBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  bonificationTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  bonificationDetail: {
    fontSize: 14,
  },
  bonificationCreatedBy: {
    fontSize: 13,
    fontStyle: "italic",
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  actionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  destructiveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
