import React, { useState } from "react";
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { IconSymbol } from "@/components/ui/icon-symbol";

type AdvanceDiscount = { months: number; discountPercentage: number };

const MONTH_LABELS: Record<number, string> = {
  1: "1 mes",
  3: "3 meses",
  6: "6 meses",
  12: "12 meses (anual)",
};

export default function PlanSelector() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const plans = useQuery(api.membershipPlans.getByOrganization, {
    activeOnly: true,
  });
  const activate = useMutation(api.memberPlanSubscriptions.activate);

  // Track selected advance months per plan
  const [selectedMonths, setSelectedMonths] = useState<Record<string, number>>(
    {},
  );

  const handleActivate = (
    planId: string,
    planName: string,
    priceArs: number,
    advanceMonths: number,
    discount?: AdvanceDiscount,
  ) => {
    const discountedPrice = discount
      ? Math.round(priceArs * (1 - discount.discountPercentage / 100))
      : priceArs;
    const totalPrice = discountedPrice * advanceMonths;

    const message =
      advanceMonths > 1
        ? `¿Querés activar el plan "${planName}" pagando ${advanceMonths} meses por adelantado?\n\nPrecio por mes: $${discountedPrice.toLocaleString("es-AR")} (${discount!.discountPercentage}% dto.)\nTotal: $${totalPrice.toLocaleString("es-AR")}`
        : `¿Querés activar el plan "${planName}"? Deberás realizar la transferencia bancaria y subir el comprobante.`;

    Alert.alert("Activar plan", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Activar",
        onPress: async () => {
          try {
            await activate({
              planId: planId as any,
              advanceMonths: advanceMonths > 1 ? advanceMonths : undefined,
            });
          } catch (err) {
            Alert.alert(
              "Error",
              err instanceof Error ? err.message : "Error al activar",
            );
          }
        },
      },
    ]);
  };

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
            Elegí tu plan
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            Seleccioná una membresía para acceder a las clases.
          </ThemedText>
        </View>

        <View style={styles.body}>
          {plans === undefined ? (
            <ActivityIndicator
              size="large"
              color={isDark ? "#fff" : "#000"}
              style={styles.loader}
            />
          ) : plans.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.05)",
                  },
                ]}
              >
                <IconSymbol
                  name="bolt.fill"
                  size={28}
                  color={isDark ? "#52525b" : "#a1a1aa"}
                />
              </View>
              <ThemedText style={styles.emptyText}>
                No hay planes disponibles en este momento. Contactá al gimnasio
                para más información.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.plansList}>
              {plans
                .filter((plan) => !plan.isFamilyPlan)
                .sort((a, b) => a.priceArs - b.priceArs)
                .map((plan) => {
                  const discounts = (plan.advancePaymentDiscounts ??
                    []) as AdvanceDiscount[];
                  const hasDiscounts = discounts.length > 0;
                  const chosenMonths = selectedMonths[plan._id] ?? 1;
                  const chosenDiscount = discounts.find(
                    (d) => d.months === chosenMonths,
                  );

                  return (
                    <View
                      key={plan._id}
                      style={[
                        styles.planCard,
                        isDark ? styles.planCardDark : styles.planCardLight,
                      ]}
                    >
                      <View style={styles.planHeader}>
                        <View
                          style={[
                            styles.planIconTile,
                            {
                              backgroundColor: isDark
                                ? "rgba(255,255,255,0.08)"
                                : "rgba(0,0,0,0.05)",
                            },
                          ]}
                        >
                          <IconSymbol
                            name="bolt.fill"
                            size={22}
                            color={isDark ? "#fff" : "#000"}
                          />
                        </View>
                        <View style={styles.planHeaderText}>
                          <Text
                            style={[
                              styles.planName,
                              { color: isDark ? "#fff" : "#000" },
                            ]}
                          >
                            {plan.name}
                          </Text>
                          <Text
                            style={[
                              styles.planPrice,
                              { color: isDark ? "#fff" : "#000" },
                            ]}
                          >
                            ${plan.priceArs.toLocaleString("es-AR")}
                            <Text style={styles.planPriceSuffix}>/mes</Text>
                          </Text>
                        </View>
                      </View>

                      {plan.description ? (
                        <Text
                          style={[
                            styles.planDescription,
                            { color: isDark ? "#a1a1aa" : "#71717a" },
                          ]}
                        >
                          {plan.description}
                        </Text>
                      ) : null}

                      <View
                        style={[
                          styles.divider,
                          {
                            backgroundColor: isDark
                              ? "rgba(255,255,255,0.08)"
                              : "rgba(0,0,0,0.06)",
                          },
                        ]}
                      />

                      <View style={styles.planDetails}>
                        <View style={styles.featureRow}>
                          <IconSymbol
                            name="checkmark"
                            size={16}
                            color={isDark ? "#4ade80" : "#16a34a"}
                          />
                          <Text
                            style={[
                              styles.planDetail,
                              { color: isDark ? "#d4d4d8" : "#3f3f46" },
                            ]}
                          >
                            {plan.weeklyClassLimit >= 9999
                              ? "Clases sin límite"
                              : `${plan.weeklyClassLimit} clases por semana`}
                          </Text>
                        </View>
                        <View style={styles.featureRow}>
                          <IconSymbol
                            name="checkmark"
                            size={16}
                            color={isDark ? "#4ade80" : "#16a34a"}
                          />
                          <Text
                            style={[
                              styles.planDetail,
                              { color: isDark ? "#d4d4d8" : "#3f3f46" },
                            ]}
                          >
                            {(plan.billingMode ?? "calendar") === "join_date"
                              ? "Pago mensual según fecha de ingreso"
                              : `Pago del ${plan.paymentWindowStartDay} al ${plan.paymentWindowEndDay} de cada mes`}
                          </Text>
                        </View>
                      </View>

                      {/* Advance payment options */}
                      {hasDiscounts && (
                        <View style={styles.discountSection}>
                          <Text
                            style={[
                              styles.discountLabel,
                              { color: isDark ? "#a1a1aa" : "#52525b" },
                            ]}
                          >
                            Pagá por adelantado y ahorrá
                          </Text>
                          <View style={styles.discountOptions}>
                            {/* Monthly (no discount) option */}
                            <Pressable
                              style={[
                                styles.discountChip,
                                {
                                  backgroundColor:
                                    chosenMonths === 1
                                      ? isDark
                                        ? "#fff"
                                        : "#000"
                                      : isDark
                                        ? "rgba(255,255,255,0.08)"
                                        : "rgba(0,0,0,0.05)",
                                },
                              ]}
                              onPress={() =>
                                setSelectedMonths((prev) => ({
                                  ...prev,
                                  [plan._id]: 1,
                                }))
                              }
                            >
                              <Text
                                style={[
                                  styles.discountChipText,
                                  {
                                    color:
                                      chosenMonths === 1
                                        ? isDark
                                          ? "#000"
                                          : "#fff"
                                        : isDark
                                          ? "#d4d4d8"
                                          : "#3f3f46",
                                  },
                                ]}
                              >
                                1 mes
                              </Text>
                            </Pressable>

                            {discounts
                              .sort((a, b) => a.months - b.months)
                              .map((discount) => {
                                const isSelected =
                                  chosenMonths === discount.months;
                                return (
                                  <Pressable
                                    key={discount.months}
                                    style={[
                                      styles.discountChip,
                                      {
                                        backgroundColor: isSelected
                                          ? isDark
                                            ? "#fff"
                                            : "#000"
                                          : isDark
                                            ? "rgba(255,255,255,0.08)"
                                            : "rgba(0,0,0,0.05)",
                                      },
                                    ]}
                                    onPress={() =>
                                      setSelectedMonths((prev) => ({
                                        ...prev,
                                        [plan._id]: discount.months,
                                      }))
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.discountChipText,
                                        {
                                          color: isSelected
                                            ? isDark
                                              ? "#000"
                                              : "#fff"
                                            : isDark
                                              ? "#d4d4d8"
                                              : "#3f3f46",
                                        },
                                      ]}
                                    >
                                      {MONTH_LABELS[discount.months] ??
                                        `${discount.months} meses`}
                                    </Text>
                                    <View
                                      style={[
                                        styles.discountChipBadge,
                                        {
                                          backgroundColor: isSelected
                                            ? "rgba(34,197,94,0.22)"
                                            : "rgba(34,197,94,0.16)",
                                        },
                                      ]}
                                    >
                                      <Text style={styles.discountChipBadgeText}>
                                        -{discount.discountPercentage}%
                                      </Text>
                                    </View>
                                  </Pressable>
                                );
                              })}
                          </View>

                          {/* Price summary for selected option */}
                          {chosenDiscount && (
                            <View
                              style={[
                                styles.discountSummary,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(34,197,94,0.12)"
                                    : "rgba(34,197,94,0.10)",
                                },
                              ]}
                            >
                              <View style={styles.discountSummaryRow}>
                                <Text
                                  style={[
                                    styles.discountSummaryText,
                                    { color: isDark ? "#d4d4d8" : "#3f3f46" },
                                  ]}
                                >
                                  $
                                  {Math.round(
                                    plan.priceArs *
                                      (1 -
                                        chosenDiscount.discountPercentage / 100),
                                  ).toLocaleString("es-AR")}
                                  /mes
                                </Text>
                                <Text
                                  style={[
                                    styles.discountSummaryText,
                                    { color: isDark ? "#d4d4d8" : "#3f3f46" },
                                  ]}
                                >
                                  Total: $
                                  {(
                                    Math.round(
                                      plan.priceArs *
                                        (1 -
                                          chosenDiscount.discountPercentage /
                                            100),
                                    ) * chosenDiscount.months
                                  ).toLocaleString("es-AR")}
                                </Text>
                              </View>
                              <Text style={styles.savingsText}>
                                Ahorrás $
                                {(
                                  plan.priceArs * chosenDiscount.months -
                                  Math.round(
                                    plan.priceArs *
                                      (1 -
                                        chosenDiscount.discountPercentage / 100),
                                  ) *
                                    chosenDiscount.months
                                ).toLocaleString("es-AR")}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      <ThemedPressable
                        type="primary"
                        style={styles.activateButton}
                        onPress={() =>
                          handleActivate(
                            plan._id,
                            plan.name,
                            plan.priceArs,
                            chosenMonths,
                            chosenDiscount,
                          )
                        }
                      >
                        <ThemedText
                          style={[
                            styles.activateText,
                            { color: isDark ? "#000" : "#fff" },
                          ]}
                        >
                          {chosenMonths > 1
                            ? `Activar plan (${chosenMonths} meses)`
                            : "Activar plan"}
                        </ThemedText>
                      </ThemedPressable>
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    marginTop: 48,
    alignItems: "center",
    gap: 16,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.6,
    paddingHorizontal: 24,
  },
  plansList: {
    gap: 16,
  },
  planCard: {
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  planCardLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  planCardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  planIconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  planHeaderText: {
    flex: 1,
    gap: 2,
  },
  planName: {
    fontSize: 18,
    fontWeight: "700",
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
  },
  planPriceSuffix: {
    fontSize: 13,
    fontWeight: "400",
    opacity: 0.6,
  },
  planDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  planDetails: {
    gap: 10,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planDetail: {
    fontSize: 14,
    flex: 1,
  },
  discountSection: {
    gap: 10,
  },
  discountLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  discountOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  discountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  discountChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  discountChipBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountChipBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#22c55e",
  },
  discountSummary: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  discountSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  discountSummaryText: {
    fontSize: 13,
    fontWeight: "500",
  },
  savingsText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#22c55e",
  },
  activateButton: {
    marginTop: 4,
  },
  activateText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
