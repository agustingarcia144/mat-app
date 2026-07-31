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
import { IconSymbol } from "@/components/ui/icon-symbol";
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
  const monthlyUsage = useQuery(
    api.classReservations.getMyMonthlyClassUsage,
    {},
  );
  const currentPayment = useQuery(api.planPayments.getMyCurrentPeriodPayment);
  const bonification = useQuery(api.planBonifications.getMyActiveBonification);
  const classes = useQuery(api.classes.getByOrganization, { activeOnly: true });
  const cancelSubscription = useMutation(api.memberPlanSubscriptions.cancel);

  // Empty means the plan includes every class, so the card omits the row
  const planIncludesClasses = subscription?.plan?.classesEnabled !== false;
  const allowedClassIds = subscription?.plan?.allowedClassIds ?? null;
  const includedClassNames =
    planIncludesClasses && allowedClassIds
      ? (classes ?? [])
          .filter((c) => allowedClassIds.includes(c._id))
          .map((c) => c.name)
      : [];

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
          { paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={[
            styles.headerCard,
            {
              paddingTop: insets.top + 20,
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.03)",
            },
          ]}
        >
          <ThemedText type="title" style={styles.title}>
            Mi Plan
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Gestioná tu membresía y pagos.
          </ThemedText>
        </View>

        <View style={styles.body}>
          {/* Plan info + monthly class usage */}
          <PlanStatusCard
            plan={subscription.plan}
            status={subscription.status}
            monthlyUsed={monthlyUsage?.used ?? 0}
            monthlyLimit={monthlyUsage?.limit ?? 0}
            includedClassNames={includedClassNames}
            classesEnabled={planIncludesClasses}
          />

          {/* Bonification banner */}
          {bonification && (
            <View
              style={[
                styles.bonificationBanner,
                {
                  backgroundColor: isDark
                    ? "rgba(168,85,247,0.14)"
                    : "rgba(168,85,247,0.10)",
                  borderColor: isDark
                    ? "rgba(168,85,247,0.3)"
                    : "rgba(168,85,247,0.25)",
                },
              ]}
            >
              <View style={styles.bonificationIcon}>
                <IconSymbol
                  name="checkmark"
                  size={20}
                  color={isDark ? "#c084fc" : "#7c3aed"}
                />
              </View>
              <View style={styles.bonificationText}>
                <Text
                  style={[
                    styles.bonificationTitle,
                    { color: isDark ? "#d8b4fe" : "#7c3aed" },
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
            </View>
          )}

          {/* Current period payment */}
          <PaymentStatusCard
            payment={currentPayment}
            planPriceArs={subscription.plan?.priceArs}
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
              style={[
                styles.actionRow,
                isDark ? styles.actionRowDark : styles.actionRowLight,
              ]}
              onPress={() => router.push("/(tabs)/plan/payment-history")}
            >
              <View
                style={[
                  styles.actionIconTile,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.05)",
                  },
                ]}
              >
                <IconSymbol
                  name="list.bullet"
                  size={20}
                  color={isDark ? "#fff" : "#000"}
                />
              </View>
              <Text
                style={[styles.actionText, { color: isDark ? "#fff" : "#000" }]}
              >
                Historial de pagos
              </Text>
              <IconSymbol
                name="chevron.right"
                size={20}
                color={isDark ? "#52525b" : "#a1a1aa"}
              />
            </ThemedPressable>

            <ThemedPressable
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelText}>Cancelar plan</Text>
            </ThemedPressable>
          </View>
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
    paddingBottom: 16,
  },
  headerCard: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 16,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.6,
  },
  body: {
    paddingHorizontal: 16,
    gap: 14,
  },
  bonificationBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bonificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(168,85,247,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bonificationText: {
    flex: 1,
    gap: 2,
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
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionRowLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  actionRowDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  actionIconTile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 18,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ef4444",
  },
});
