import React from "react";
import { StyleSheet, View } from "react-native";

import { MetricCard } from "@/components/features/metrics/metric-card";

type SummaryCardsProps = {
  incomeArs: number;
  expenseArs: number;
  netResultArs: number;
  activeRecurringRules: number;
};

export function SummaryCards({
  incomeArs,
  expenseArs,
  netResultArs,
  activeRecurringRules,
}: SummaryCardsProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <MetricCard
          label="Ingresos"
          value={`$${incomeArs.toLocaleString("es-AR")}`}
        />
        <MetricCard
          label="Egresos"
          value={`$${expenseArs.toLocaleString("es-AR")}`}
        />
      </View>
      <View style={styles.row}>
        <MetricCard
          label="Resultado neto"
          value={`$${netResultArs.toLocaleString("es-AR")}`}
          trend={netResultArs > 0 ? "up" : netResultArs < 0 ? "down" : "flat"}
        />
        <MetricCard
          label="Reglas activas"
          value={String(activeRecurringRules)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
});
