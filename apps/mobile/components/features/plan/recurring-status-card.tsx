import React from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";

const money = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : `$${value.toLocaleString("es-AR")}`;

const day = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Date(value).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
      });

type Tone = "neutral" | "positive" | "warning" | "danger";

const TONES: Record<Tone, { light: string; dark: string; text: string }> = {
  neutral: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.06)", text: "#6B7280" },
  positive: { light: "rgba(16,185,129,0.10)", dark: "rgba(16,185,129,0.16)", text: "#059669" },
  warning: { light: "rgba(245,158,11,0.10)", dark: "rgba(245,158,11,0.16)", text: "#B45309" },
  danger: { light: "rgba(239,68,68,0.10)", dark: "rgba(239,68,68,0.16)", text: "#DC2626" },
};

/**
 * The member's automatic-debit state.
 *
 * Kept separate from the plan status on purpose: during the grace period after
 * a failed charge the plan is still active — the member keeps training — while
 * the billing state says their card was rejected and by when they need to fix
 * it. Showing only one of the two would either hide the problem or imply they
 * have already lost access.
 */
export default function RecurringStatusCard() {
  const isDark = useColorScheme() === "dark";
  const state = useQuery(api.memberPaymentsCheckout.getMyRecurringState);

  if (!state || state.billingState === "none") return null;

  const view = describe(state);
  if (!view) return null;

  const tone = TONES[view.tone];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: isDark ? tone.dark : tone.light },
      ]}
    >
      <IconSymbol name={view.icon} size={20} color={tone.text} />
      <View style={styles.body}>
        <ThemedText style={[styles.title, { color: tone.text }]}>
          {view.title}
        </ThemedText>
        <ThemedText style={styles.detail}>{view.detail}</ThemedText>
        {view.note ? (
          <ThemedText style={styles.note}>{view.note}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

type CardView = {
  tone: Tone;
  icon: "checkmark" | "clock.fill" | "exclamationmark.circle.fill";
  title: string;
  detail: string;
  note?: string;
};

function describe(state: {
  billingState: string;
  amountArs: number | null;
  pendingAmountArs: number | null;
  pendingAmountEffectiveAt: number | null;
  nextChargeAt: number | null;
  graceUntil: number | null;
  accessEndsAt: number | null;
  isFamilyChild: boolean;
  isPayer: boolean;
}): CardView | null {
  if (state.isFamilyChild) {
    return {
      tone: "neutral",
      icon: "checkmark",
      title: "Plan familiar",
      detail: "El pago de tu grupo lo hace el titular.",
    };
  }

  const pendingNote =
    state.pendingAmountArs !== null
      ? `Desde el ${day(state.pendingAmountEffectiveAt)} vas a pagar ${money(state.pendingAmountArs)}.`
      : undefined;

  switch (state.billingState) {
    case "pending_authorization":
      return {
        tone: "warning",
        icon: "clock.fill",
        title: "Falta autorizar el débito",
        detail:
          "Todavía no completaste el pago en Mercado Pago. Hasta que se acredite no tenés acceso.",
      };

    case "pending_first_payment":
      return {
        tone: "warning",
        icon: "clock.fill",
        title: "Esperando el primer cobro",
        detail:
          "Autorizaste el débito y estamos esperando que Mercado Pago haga el primer cobro. Vas a tener acceso apenas se acredite.",
      };

    case "active":
      return {
        tone: "positive",
        icon: "checkmark",
        title: "Débito automático activo",
        detail: `${money(state.amountArs)} por mes · próximo cobro el ${day(state.nextChargeAt)}.`,
        note: pendingNote,
      };

    case "retrying":
      return {
        tone: "warning",
        icon: "exclamationmark.circle.fill",
        title: "No pudimos cobrarte",
        detail: state.graceUntil
          ? `Mercado Pago rechazó el cobro. Conservás el acceso hasta el ${day(state.graceUntil)} mientras lo reintentamos.`
          : "Mercado Pago rechazó el cobro y lo estamos reintentando.",
        note: "Revisá el saldo o los datos de tu tarjeta en Mercado Pago.",
      };

    case "grace_expired":
      return {
        tone: "danger",
        icon: "exclamationmark.circle.fill",
        title: "Se venció el plazo de pago",
        detail:
          "No pudimos cobrarte y el plazo extra terminó. Actualizá tu medio de pago o pagá por transferencia para recuperar el acceso.",
      };

    case "paused_bonification":
      return {
        tone: "positive",
        icon: "checkmark",
        title: "Débito en pausa",
        detail:
          "Tu plan está bonificado, así que no te cobramos. Conservás el acceso completo.",
      };

    case "cancellation_scheduled":
      return {
        tone: "warning",
        icon: "clock.fill",
        title: "Baja programada",
        detail: state.accessEndsAt
          ? `Ya no te vamos a cobrar más. Mantenés el acceso hasta el ${day(state.accessEndsAt)}.`
          : "Ya no te vamos a cobrar más.",
      };

    case "failed":
      return {
        tone: "danger",
        icon: "exclamationmark.circle.fill",
        title: "El débito automático se detuvo",
        detail:
          "Tenés que volver a autorizarlo para seguir pagando automáticamente. Mientras tanto podés pagar por transferencia.",
      };

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
  body: { flex: 1, gap: 3 },
  title: { fontWeight: "700" },
  detail: { fontSize: 13, lineHeight: 19, opacity: 0.85 },
  note: { fontSize: 12, lineHeight: 17, opacity: 0.65 },
});
