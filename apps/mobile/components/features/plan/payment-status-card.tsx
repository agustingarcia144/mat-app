import React from "react";
import { StyleSheet, View, Text } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { ThemedText } from "@/components/ui/themed-text";
import { IconSymbol } from "@/components/ui/icon-symbol";

const PAYMENT_STATUS: Record<string, { label: string; accent: string; tint: string }> =
  {
    pending: { label: "Pendiente", accent: "#f59e0b", tint: "rgba(245,158,11,0.16)" },
    in_review: { label: "En revisión", accent: "#3b82f6", tint: "rgba(59,130,246,0.16)" },
    approved: { label: "Aprobado", accent: "#22c55e", tint: "rgba(34,197,94,0.16)" },
    declined: { label: "Rechazado", accent: "#ef4444", tint: "rgba(239,68,68,0.16)" },
    bonification: { label: "Bonificado", accent: "#a855f7", tint: "rgba(168,85,247,0.16)" },
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
        _id?: string;
        billingPeriod: string;
        amountArs: number;
        totalAmountArs?: number;
        payableAmountArs?: number;
        coveredMemberCount?: number;
        interestApplied?: AppliedTier[];
        status: string;
        reviewNotes?: string;
        isBonification?: boolean;
        paymentMethod?: string;
      }
    | null
    | undefined;
  planPriceArs?: number;
  onUploadPress: () => void;
}

export default function PaymentStatusCard({
  payment,
  planPriceArs,
  onUploadPress,
}: PaymentStatusCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  if (payment === undefined) return null; // Loading
  if (!payment) return null; // No payment record yet

  const isFullyBonified = payment.paymentMethod === "bonification";
  const hasDiscount = payment.isBonification || isFullyBonified;
  const statusInfo = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.pending;
  const planPriceFallback =
    !isFullyBonified && !payment.isBonification && payment.amountArs <= 0
      ? planPriceArs != null
        ? planPriceArs * (payment.coveredMemberCount ?? 1)
        : undefined
      : undefined;
  const payableAmountArs =
    payment.payableAmountArs ??
    payment.totalAmountArs ??
    planPriceFallback ??
    payment.amountArs;
  const baseAmountArs =
    payment.amountArs > 0 ? payment.amountArs : payableAmountArs;
  // A comprobante only makes sense for a payment the member makes by
  // transfer. A Mercado Pago charge is verified with Mercado Pago, so offering
  // an upload there would invite a receipt nobody reads — and imply the member
  // has to do something when they do not.
  const isProviderPayment =
    payment.paymentMethod === "mercadopago_recurring" ||
    payment.paymentMethod === "mercadopago_checkout";
  const canUpload =
    !isFullyBonified &&
    !isProviderPayment &&
    (payment.status === "pending" || payment.status === "declined");

  return (
    <View style={[styles.card, isDark ? styles.cardDark : styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: statusInfo.tint }]}>
          <IconSymbol name="calendar" size={20} color={statusInfo.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: isDark ? "#71717a" : "#a1a1aa" }]}>
            Pago del período
          </Text>
          <Text style={[styles.periodText, { color: isDark ? "#fff" : "#000" }]}>
            {formatBillingPeriod(payment.billingPeriod)}
          </Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <View style={[styles.statusPill, { backgroundColor: statusInfo.tint }]}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.accent }]} />
          <Text style={[styles.statusText, { color: statusInfo.accent }]}>
            {statusInfo.label}
          </Text>
        </View>
        {hasDiscount ? (
          <View
            style={[
              styles.statusPill,
              { backgroundColor: PAYMENT_STATUS.bonification.tint },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: PAYMENT_STATUS.bonification.accent },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                { color: PAYMENT_STATUS.bonification.accent },
              ]}
            >
              {PAYMENT_STATUS.bonification.label}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.divider,
          { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
        ]}
      />

      {payment.interestApplied?.length ? (
        <View style={styles.amountBreakdown}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountBase, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
              Base
            </Text>
            <Text style={[styles.amountBase, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
              ${baseAmountArs.toLocaleString("es-AR")}
            </Text>
          </View>
          {payment.interestApplied.map((tier, i) => (
            <View key={i} style={styles.amountRow}>
              <Text style={styles.amountInterest}>
                Mora (
                {tier.type === "percentage"
                  ? `${tier.value}%`
                  : `$${tier.value.toLocaleString("es-AR")} fijo`}
                )
              </Text>
              <Text style={styles.amountInterest}>
                +${tier.amountArs.toLocaleString("es-AR")}
              </Text>
            </View>
          ))}
          <View style={styles.amountRow}>
            <Text style={[styles.amountTotalLabel, { color: isDark ? "#fff" : "#000" }]}>
              Total
            </Text>
            <Text style={[styles.amountTotal, { color: isDark ? "#fff" : "#000" }]}>
              ${payableAmountArs.toLocaleString("es-AR")}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.amountRow}>
          <Text style={[styles.amountLabel, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
            Monto
          </Text>
          <Text style={[styles.amountValue, { color: isDark ? "#fff" : "#000" }]}>
            ${payableAmountArs.toLocaleString("es-AR")}
          </Text>
        </View>
      )}

      {payment.status === "declined" && payment.reviewNotes ? (
        <View style={styles.declinedBox}>
          <IconSymbol name="xmark" size={14} color="#ef4444" />
          <Text style={styles.declinedNote}>
            Motivo del rechazo: {payment.reviewNotes}
          </Text>
        </View>
      ) : null}

      {isProviderPayment && payment.status !== "approved" ? (
        <Text style={[styles.providerNote, { color: isDark ? "#a1a1aa" : "#71717a" }]}>
          Este período se cobra con Mercado Pago. No hace falta que subas nada.
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
  providerNote: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardLight: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  cardDark: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  periodText: {
    fontSize: 17,
    fontWeight: "700",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  amountBreakdown: {
    gap: 6,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amountBase: {
    fontSize: 13,
  },
  amountInterest: {
    fontSize: 13,
    color: "#d97706",
    fontWeight: "500",
  },
  amountTotalLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  amountTotal: {
    fontSize: 16,
    fontWeight: "700",
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  declinedBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    padding: 12,
  },
  declinedNote: {
    flex: 1,
    fontSize: 13,
    color: "#ef4444",
  },
  uploadButton: {
    marginTop: 2,
  },
  uploadText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
