import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import type { SubscriptionGateStatus } from "@/hooks/use-subscription-gate";

interface SubscriptionBannerProps {
  status: SubscriptionGateStatus;
  isDark: boolean;
  onPress: () => void;
}

/**
 * Inline banner shown on the home dashboard when the member's subscription
 * is suspended or missing. Directs them to the Plan tab.
 */
export function SubscriptionBanner({
  status,
  isDark,
  onPress,
}: SubscriptionBannerProps) {
  const isSuspended = status === "suspended";

  const bgColor = isSuspended
    ? isDark
      ? "rgba(239,68,68,0.12)"
      : "rgba(239,68,68,0.08)"
    : isDark
      ? "rgba(234,88,12,0.12)"
      : "rgba(234,88,12,0.08)";

  const borderColor = isSuspended
    ? isDark
      ? "rgba(239,68,68,0.3)"
      : "rgba(239,68,68,0.2)"
    : isDark
      ? "rgba(234,88,12,0.3)"
      : "rgba(234,88,12,0.2)";

  const textColor = isSuspended
    ? isDark
      ? "#fca5a5"
      : "#dc2626"
    : isDark
      ? "#fdba74"
      : "#c2410c";

  const title = isSuspended ? "Plan suspendido" : "Sin plan activo";
  const description = isSuspended
    ? "Tu plan está suspendido por falta de pago. Regularizá tu situación para entrenar."
    : "Activá un plan para acceder a tus entrenamientos y planificaciones.";
  const buttonLabel = isSuspended ? "Ir a Pagos" : "Ver Planes";

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor, borderColor }]}
    >
      <Text style={styles.icon}>{isSuspended ? "🔒" : "📋"}</Text>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        <Text style={[styles.description, { color: textColor, opacity: 0.85 }]}>
          {description}
        </Text>
      </View>
      <ThemedPressable
        type="primary"
        onPress={onPress}
        style={styles.button}
      >
        <Text
          style={[
            styles.buttonText,
            { color: isDark ? "#000" : "#fff" },
          ]}
        >
          {buttonLabel}
        </Text>
      </ThemedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 8,
    alignItems: "center",
  },
  icon: {
    fontSize: 28,
  },
  textWrap: {
    gap: 4,
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  button: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
    alignSelf: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
