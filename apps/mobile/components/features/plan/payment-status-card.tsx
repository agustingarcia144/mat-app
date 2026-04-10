import React from "react";
import { StyleSheet, View, Text } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";

const PAYMENT_STATUS: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: "Pendiente", color: "#f59e0b", bgColor: "#fef3c7" },
  in_review: { label: "En revisión", color: "#3b82f6", bgColor: "#dbeafe" },
  approved: { label: "Aprobado", color: "#22c55e", bgColor: "#dcfce7" },
  declined: { label: "Rechazado", color: "#ef4444", bgColor: "#fee2e2" },
  bonification: { label: "Bonificado", color: "#a855f7", bgColor: "#f3e8ff" },
};

function formatBillingPeriod(period: string): string {
  const [year, month] = period.split("-");
  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const monthIndex = parseInt(month!, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

interface AppliedTier {
  daysAfterWindowEnd: number;
  type: "percentage" | "fixed";
  value: number;
  amountArs: number;
}

interface PaymentStatusCardProps {
  payment:
    | {
        _id: string;
        billingPeriod: string;
        amountArs: number;
        totalAmountArs?: number;
        interestApplied?: AppliedTier[];
        status: string;
        reviewNotes?: string;
        isBonification?: boolean;
        paymentMethod?: string;
      }
    | null
    | undefined;
  onUploadPress: () => void;
}

export default function PaymentStatusCard({
  payment,
  onUploadPress,
}: PaymentStatusCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (payment === undefined) return null; // Loading
  if (!payment) return null; // No payment record yet

  const isBonification =
    payment.isBonification || payment.paymentMethod === "bonification";
  const statusInfo = isBonification
    ? PAYMENT_STATUS.bonification
    : (PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.pending);
  const canUpload =
    !isBonification &&
    (payment.status === "pending" || payment.status === "declined");

  return (
    <View
      style={[styles.card, { backgroundColor: isDark ? "#1c1c1e" : "#f5f5f5" }]}
    >
      <View style={styles.header}>
        <Text style={[styles.periodText, { color: isDark ? "#fff" : "#000" }]}>
          Pago: {formatBillingPeriod(payment.billingPeriod)}
        </Text>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isDark
                ? statusInfo.color + "33"
                : statusInfo.bgColor,
            },
          ]}
        >
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
      </View>

      {payment.interestApplied?.length ? (
        <View style={styles.amountBreakdown}>
          <Text
            style={[styles.amountBase, { color: isDark ? "#aaa" : "#888" }]}
          >
            Base: ${payment.amountArs.toLocaleString("es-AR")}
          </Text>
          {payment.interestApplied.map((tier, i) => (
            <Text key={i} style={styles.amountInterest}>
              + Mora (
              {tier.type === "percentage"
                ? `${tier.value}%`
                : `$${tier.value.toLocaleString("es-AR")} fijo`}
              ): +${tier.amountArs.toLocaleString("es-AR")}
            </Text>
          ))}
          <Text
            style={[styles.amountTotal, { color: isDark ? "#fff" : "#000" }]}
          >
            Total: $
            {(payment.totalAmountArs ?? payment.amountArs).toLocaleString(
              "es-AR",
            )}
          </Text>
        </View>
      ) : (
        <Text style={[styles.amount, { color: isDark ? "#ccc" : "#444" }]}>
          Monto: ${payment.amountArs.toLocaleString("es-AR")}
        </Text>
      )}

      {payment.status === "declined" && payment.reviewNotes ? (
        <Text style={styles.declinedNote}>
          Motivo del rechazo: {payment.reviewNotes}
        </Text>
      ) : null}

      {canUpload ? (
        <ThemedPressable
          type="primary"
          style={styles.uploadButton}
          onPress={onUploadPress}
        >
          <ThemedText
            style={[styles.uploadText, { color: isDark ? "#000" : "#fff" }]}
          >
            {payment.status === "declined"
              ? "Subir nuevo comprobante"
              : "Subir comprobante"}
          </ThemedText>
        </ThemedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  periodText: {
    fontSize: 16,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  amount: {
    fontSize: 14,
  },
  amountBreakdown: {
    gap: 2,
  },
  amountBase: {
    fontSize: 13,
  },
  amountInterest: {
    fontSize: 13,
    color: "#d97706",
  },
  amountTotal: {
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  declinedNote: {
    fontSize: 13,
    color: "#ef4444",
    fontStyle: "italic",
  },
  uploadButton: {
    marginTop: 4,
  },
  uploadText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
