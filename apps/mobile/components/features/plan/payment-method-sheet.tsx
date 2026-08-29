import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { IconSymbol } from "@/components/ui/icon-symbol";

const MONTH_LABELS: Record<number, string> = {
  3: "3 meses",
  6: "6 meses",
  12: "12 meses",
};

type Selection =
  | { kind: "transfer_monthly" }
  | { kind: "transfer_advance"; months: number }
  | { kind: "recurring" }
  | { kind: "mercadopago_advance"; months: number };

/**
 * How the member chooses to pay.
 *
 * The list comes from the server, which already knows the gym's settings, the
 * plan's billing mode, whether an account is connected and whether this member
 * is the family payer. Unavailable options are shown with the reason rather
 * than hidden, so a member can tell "not for this plan" from "ask your gym".
 */
export default function PaymentMethodSheet({
  planId,
  planName,
  visible,
  onClose,
}: {
  planId: string | null;
  planName: string;
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const options = useQuery(
    api.memberPaymentsCheckout.getAvailablePaymentMethods,
    planId ? { planId: planId as never } : "skip",
  );

  const activate = useMutation(api.memberPlanSubscriptions.activate);
  const startRecurring = useAction(
    api.memberPaymentsActions.startRecurringCheckout,
  );
  const startAdvance = useAction(api.memberPaymentsActions.startAdvanceCheckout);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methods = useMemo(() => {
    const byMethod = new Map(
      (options?.methods ?? []).map((method) => [method.method, method]),
    );
    return {
      transfer: byMethod.get("bank_transfer"),
      recurring: byMethod.get("mercadopago_recurring"),
      advance: byMethod.get("mercadopago_checkout"),
    };
  }, [options]);

  const money = (value: number) => `$${value.toLocaleString("es-AR")}`;

  const openCheckout = async (checkoutUrl: string, sessionId: string) => {
    // openAuthSessionAsync closes the browser as soon as Mercado Pago
    // redirects back to our return URL, instead of stranding the member on a
    // web page with no way back into the app.
    await WebBrowser.openAuthSessionAsync(
      checkoutUrl,
      "https://matgestion.app/payments/return",
    );

    // Whatever the browser reported, the backend decides. Send the member to
    // the screen that asks it.
    onClose();
    router.push(`/payments/return?session=${encodeURIComponent(sessionId)}`);
  };

  const confirm = async () => {
    if (!planId || !selection || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (selection.kind === "transfer_monthly") {
        await activate({ planId: planId as never });
        onClose();
        return;
      }

      if (selection.kind === "transfer_advance") {
        await activate({
          planId: planId as never,
          advanceMonths: selection.months,
        });
        onClose();
        return;
      }

      if (selection.kind === "recurring") {
        const result = await startRecurring({ planId: planId as never });
        await openCheckout(result.checkoutUrl, result.sessionId);
        return;
      }

      const result = await startAdvance({
        planId: planId as never,
        months: selection.months,
      });
      await openCheckout(result.checkoutUrl, result.sessionId);
    } catch (error) {
      Alert.alert(
        "No pudimos continuar",
        error instanceof Error
          ? error.message
          : "Ocurrió un error. Intentá de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardStyle = [
    styles.sheet,
    { backgroundColor: isDark ? "#161618" : "#FFFFFF", paddingBottom: insets.bottom + 16 },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={cardStyle}>
        <View style={styles.handle} />
        <ThemedText type="subtitle" style={styles.title}>
          ¿Cómo querés pagar {planName}?
        </ThemedText>

        {options === undefined ? (
          <ActivityIndicator style={styles.loader} />
        ) : options === null ? (
          <ThemedText style={styles.unavailable}>
            No pudimos cargar las opciones de pago.
          </ThemedText>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
          >
            {options.isFamilyChild ? (
              <ThemedText style={styles.unavailable}>
                El pago de tu grupo familiar lo hace el titular. Vas a tener
                acceso apenas se registre el pago.
              </ThemedText>
            ) : (
              <>
                <ThemedText style={styles.priceLine}>
                  {money(options.monthlyAmountArs)} por mes
                  {options.coveredMemberCount > 1
                    ? ` · grupo familiar de ${options.coveredMemberCount}`
                    : ""}
                  {options.hasBonification ? " · con bonificación" : ""}
                </ThemedText>

                <MethodOption
                  title="Débito automático"
                  subtitle={`Mercado Pago te cobra ${money(options.monthlyAmountArs)} todos los meses. Lo podés cancelar cuando quieras.`}
                  available={methods.recurring?.available ?? false}
                  reason={methods.recurring?.reason}
                  selected={selection?.kind === "recurring"}
                  onPress={() => setSelection({ kind: "recurring" })}
                  isDark={isDark}
                />

                <MethodOption
                  title="Transferencia mensual"
                  subtitle="Transferís todos los meses y subís el comprobante desde la app."
                  available={methods.transfer?.available ?? false}
                  reason={methods.transfer?.reason}
                  selected={selection?.kind === "transfer_monthly"}
                  onPress={() => setSelection({ kind: "transfer_monthly" })}
                  isDark={isDark}
                />

                {options.advanceOptions.length > 0 ? (
                  <>
                    <ThemedText style={styles.sectionLabel}>
                      Pagar por adelantado
                    </ThemedText>
                    {options.advanceOptions.map((option) => (
                      <View key={option.months} style={styles.advanceRow}>
                        <MethodOption
                          title={`${MONTH_LABELS[option.months] ?? `${option.months} meses`} con Mercado Pago`}
                          subtitle={`${money(option.totalArs)} en un pago · ${option.discountPercentage}% de descuento`}
                          available={methods.advance?.available ?? false}
                          reason={methods.advance?.reason}
                          selected={
                            selection?.kind === "mercadopago_advance" &&
                            selection.months === option.months
                          }
                          onPress={() =>
                            setSelection({
                              kind: "mercadopago_advance",
                              months: option.months,
                            })
                          }
                          isDark={isDark}
                        />
                        <MethodOption
                          title={`${MONTH_LABELS[option.months] ?? `${option.months} meses`} por transferencia`}
                          subtitle={`${money(option.totalArs)} en una transferencia · un solo comprobante`}
                          available={methods.transfer?.available ?? false}
                          reason={methods.transfer?.reason}
                          selected={
                            selection?.kind === "transfer_advance" &&
                            selection.months === option.months
                          }
                          onPress={() =>
                            setSelection({
                              kind: "transfer_advance",
                              months: option.months,
                            })
                          }
                          isDark={isDark}
                        />
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        )}

        <ThemedPressable
          style={[styles.confirm, !selection && styles.confirmDisabled]}
          disabled={!selection || isSubmitting}
          onPress={confirm}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.confirmText}>Continuar</ThemedText>
          )}
        </ThemedPressable>
      </View>
    </Modal>
  );
}

function MethodOption({
  title,
  subtitle,
  available,
  reason,
  selected,
  onPress,
  isDark,
}: {
  title: string;
  subtitle: string;
  available: boolean;
  reason?: string;
  selected: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={available ? onPress : undefined}
      disabled={!available}
      style={[
        styles.option,
        {
          borderColor: selected
            ? "#10B981"
            : isDark
              ? "rgba(255,255,255,0.12)"
              : "rgba(0,0,0,0.1)",
          opacity: available ? 1 : 0.55,
        },
      ]}
    >
      <View style={styles.optionBody}>
        <ThemedText style={styles.optionTitle}>{title}</ThemedText>
        <ThemedText style={styles.optionSubtitle}>
          {available ? subtitle : (reason ?? subtitle)}
        </ThemedText>
      </View>
      {selected ? (
        <IconSymbol name="checkmark.circle.fill" size={22} color="#10B981" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    marginBottom: 12,
  },
  title: { marginBottom: 12 },
  loader: { marginVertical: 32 },
  list: { flexGrow: 0 },
  listContent: { gap: 10, paddingBottom: 12 },
  priceLine: { opacity: 0.7, marginBottom: 4 },
  sectionLabel: { marginTop: 8, fontWeight: "600", opacity: 0.8 },
  advanceRow: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
  },
  optionBody: { flex: 1, gap: 2 },
  optionTitle: { fontWeight: "600" },
  optionSubtitle: { fontSize: 13, opacity: 0.7, lineHeight: 18 },
  unavailable: { opacity: 0.7, marginVertical: 24, textAlign: "center" },
  confirm: {
    marginTop: 12,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#10B981",
  },
  confirmDisabled: { opacity: 0.5 },
  confirmText: { color: "#FFFFFF", fontWeight: "700" },
});
