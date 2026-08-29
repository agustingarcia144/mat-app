import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";

import { ThemedView } from "@/components/ui/themed-view";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Where Mercado Pago sends the member back to after checkout.
 *
 * This screen is navigation only. Coming back from the browser proves the
 * member closed a web page, not that any money moved — so nothing here decides
 * that a payment succeeded. It reports what the backend has independently
 * verified from Mercado Pago, and waits while that verification happens.
 */
export default function PaymentReturnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ session?: string }>();
  const sessionId = typeof params.session === "string" ? params.session : null;

  const session = useQuery(
    api.memberPaymentsCheckout.getMyCheckoutSession,
    sessionId ? { sessionId: sessionId as never } : "skip",
  );
  const markReturned = useMutation(
    api.memberPaymentsCheckout.markCheckoutReturned,
  );

  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const markedRef = useRef(false);

  // Tell the backend the member is back, so the session moves out of "opened"
  // and the reconciliation worker knows to look for a result.
  useEffect(() => {
    if (!sessionId || markedRef.current) return;
    markedRef.current = true;
    void markReturned({ sessionId: sessionId as never }).catch(() => {
      // A failure here only affects reporting; the webhook is authoritative.
    });
  }, [markReturned, sessionId]);

  // Mercado Pago's notification usually lands in seconds, but it can be slow.
  // After a while, stop implying something is wrong and let the member leave.
  useEffect(() => {
    const timer = setTimeout(() => setWaitedTooLong(true), 20_000);
    return () => clearTimeout(timer);
  }, []);

  const goToPlan = useCallback(() => {
    router.replace("/(tabs)/plan");
  }, [router]);

  const view = resolveView({
    hasSession: sessionId !== null,
    session: session ?? null,
    waitedTooLong,
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.content, { paddingTop: insets.top + 48 }]}>
        {view.spinner ? (
          <ActivityIndicator size="large" />
        ) : (
          <IconSymbol name={view.icon} size={56} color={view.color} />
        )}

        <ThemedText type="title" style={styles.title}>
          {view.title}
        </ThemedText>
        <ThemedText style={styles.body}>{view.body}</ThemedText>

        {view.showAction ? (
          <ThemedPressable style={styles.button} onPress={goToPlan}>
            <ThemedText style={styles.buttonText}>{view.actionLabel}</ThemedText>
          </ThemedPressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

type ReturnView = {
  spinner: boolean;
  icon: "checkmark.circle.fill" | "exclamationmark.circle.fill" | "clock.fill";
  color: string;
  title: string;
  body: string;
  showAction: boolean;
  actionLabel: string;
};

/**
 * What the member sees, derived only from state the server has confirmed.
 *
 * `subscriptionStatus` is the single field that means the member actually has
 * access. Session status alone never claims success.
 */
function resolveView(params: {
  hasSession: boolean;
  session: {
    status: string;
    subscriptionStatus: string | null;
    failureReason?: string | null;
  } | null;
  waitedTooLong: boolean;
}): ReturnView {
  const base = {
    spinner: false,
    icon: "clock.fill" as const,
    color: "#F59E0B",
    showAction: true,
    actionLabel: "Ir a mi plan",
  };

  if (!params.hasSession) {
    return {
      ...base,
      icon: "exclamationmark.circle.fill",
      color: "#EF4444",
      title: "No encontramos el pago",
      body: "Volvé a tu plan para ver el estado o intentar de nuevo.",
    };
  }

  if (params.session === null) {
    return {
      ...base,
      spinner: true,
      title: "Verificando el pago",
      body: "Estamos confirmando con Mercado Pago. No cierres la app.",
      showAction: false,
    };
  }

  const { status, subscriptionStatus } = params.session;

  if (subscriptionStatus === "active") {
    return {
      ...base,
      icon: "checkmark.circle.fill",
      color: "#10B981",
      title: "¡Listo!",
      body: "Confirmamos tu pago y ya tenés acceso a las clases.",
      actionLabel: "Ver mi plan",
    };
  }

  if (status === "failed" || status === "cancelled") {
    return {
      ...base,
      icon: "exclamationmark.circle.fill",
      color: "#EF4444",
      title: "No pudimos completar el pago",
      body:
        params.session.failureReason?.trim() ||
        "El pago no se completó. Podés intentarlo de nuevo desde tu plan.",
      actionLabel: "Volver a intentar",
    };
  }

  if (status === "expired") {
    return {
      ...base,
      icon: "exclamationmark.circle.fill",
      color: "#EF4444",
      title: "El pago venció",
      body: "Pasó demasiado tiempo. Iniciá el pago de nuevo desde tu plan.",
      actionLabel: "Volver a intentar",
    };
  }

  if (params.waitedTooLong) {
    return {
      ...base,
      title: "Seguimos verificando",
      body: "Mercado Pago está tardando en confirmar. Podés cerrar esta pantalla: apenas se acredite vas a ver tu plan activo.",
    };
  }

  return {
    ...base,
    spinner: true,
    title: "Verificando el pago",
    body: "Estamos confirmando con Mercado Pago. No cierres la app.",
    showAction: false,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { textAlign: "center", marginTop: 8 },
  body: { textAlign: "center", opacity: 0.75, lineHeight: 22 },
  button: {
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { fontWeight: "600" },
});
