import React, { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@repo/convex";
import { Stack, useRouter } from "expo-router";
import { format } from "date-fns";
import { FlashList } from "@shopify/flash-list";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { ThemedPressable } from "@/components/ui/themed-pressable";
import { PaymentRow } from "@/components/features/payments/payment-row";
import { MonthPicker } from "@/components/ui/month-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

type Segment = "review" | "history";

export default function PaymentsListScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("review");
  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));

  const pending = useQuery(api.planPayments.getPendingByOrganization);
  const history = useQuery(api.planPayments.getByOrganization, {});

  const historyForPeriod = useMemo(() => {
    if (!history) return [];
    return history.filter(
      (p: any) => p.billingPeriod === period || !period,
    );
  }, [history, period]);

  const data = segment === "review" ? pending : historyForPeriod;
  const loading = data === undefined;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <ThemedPressable
              type="primary"
              lightColor="#000"
              darkColor="#fff"
              style={styles.addBtn}
              onPress={() => router.push("/(tabs)/more/payments/record" as any)}
            >
              <MaterialIcons
                name="add"
                size={18}
                color={isDark ? "#000" : "#fff"}
              />
            </ThemedPressable>
          ),
        }}
      />
      <View style={styles.safe}>

        <View style={styles.segmentRow}>
          {(["review", "history"] as Segment[]).map((s) => (
            <ThemedPressable
              key={s}
              onPress={() => setSegment(s)}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor:
                    segment === s
                      ? isDark
                        ? "#fff"
                        : "#000"
                      : "transparent",
                  borderColor: isDark
                    ? Colors.dark.border
                    : Colors.light.border,
                },
              ]}
            >
              <ThemedText
                type="defaultSemiBold"
                style={{
                  fontSize: 13,
                  color:
                    segment === s
                      ? isDark
                        ? "#000"
                        : "#fff"
                      : isDark
                        ? "#fff"
                        : "#000",
                }}
              >
                {s === "review" ? "En revisión" : "Historial"}
              </ThemedText>
            </ThemedPressable>
          ))}
        </View>

        {segment === "history" ? (
          <View style={styles.periodWrapper}>
            <MonthPicker value={period} onChange={setPeriod} />
          </View>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : (data as any[]).length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              title={
                segment === "review"
                  ? "Sin pagos pendientes"
                  : "Sin pagos en este período"
              }
              description="No hay pagos para mostrar."
            />
          </View>
        ) : (
          <FlashList
            data={data as any[]}
            keyExtractor={(item: any) => item._id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }: any) => (
              <PaymentRow
                memberName={item.userFullName ?? item.userName ?? "—"}
                planName={item.planName}
                billingPeriod={item.billingPeriod}
                amountArs={item.payableAmountArs ?? item.amountArs}
                status={item.status}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/more/payments/[paymentId]" as any,
                    params: { paymentId: item._id },
                  })
                }
              />
            )}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
  },
  periodWrapper: { marginHorizontal: 20, marginBottom: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
