import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  useSubscriptionGate,
  type SubscriptionGateStatus,
} from "@/hooks/use-subscription-gate";

interface SubscriptionGateProps {
  children: React.ReactNode;
  /** Optional: show a loading indicator while subscription data loads */
  loadingFallback?: React.ReactNode;
}

/**
 * Wraps a screen's content and blocks access if the member doesn't
 * have an active subscription. Shows a contextual message + CTA to
 * navigate to the Plan tab.
 */
export function SubscriptionGate({
  children,
  loadingFallback,
}: SubscriptionGateProps) {
  const { status, canAccess } = useSubscriptionGate();

  if (status === "loading") {
    return loadingFallback ? <>{loadingFallback}</> : null;
  }

  if (canAccess) {
    return <>{children}</>;
  }

  return <SubscriptionBlockedScreen status={status} />;
}

function SubscriptionBlockedScreen({
  status,
}: {
  status: SubscriptionGateStatus;
}) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const isSuspended = status === "suspended";
  const title = isSuspended ? "Plan suspendido" : "Sin plan activo";
  const description = isSuspended
    ? "Tu plan está suspendido por falta de pago. Realizá el pago para volver a acceder a tus entrenamientos."
    : "Necesitás un plan activo para acceder a tus entrenamientos y planificaciones.";
  const buttonLabel = isSuspended ? "Ir a Pagos" : "Ver Planes";

  const iconBg = isSuspended
    ? isDark
      ? "rgba(239,68,68,0.15)"
      : "rgba(239,68,68,0.08)"
    : isDark
      ? "rgba(234,88,12,0.15)"
      : "rgba(234,88,12,0.08)";

  const mutedColor = isDark ? "#a1a1aa" : "#71717a";

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
          <Text style={styles.icon}>{isSuspended ? "🔒" : "📋"}</Text>
        </View>

        <ThemedText style={styles.title}>{title}</ThemedText>
        <Text style={[styles.description, { color: mutedColor }]}>
          {description}
        </Text>

        <ThemedPressable
          type="primary"
          onPress={() => router.push("/plan" as Href)}
          style={styles.ctaButton}
        >
          <Text
            style={[
              styles.ctaButtonText,
              { color: isDark ? "#000" : "#fff" },
            ]}
          >
            {buttonLabel}
          </Text>
        </ThemedPressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  ctaButton: {
    marginTop: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    alignSelf: "center",
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
