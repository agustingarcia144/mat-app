import React, { useState } from "react";
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
import { SummaryCards } from "@/components/features/finance/summary-cards";
import { TransactionRow } from "@/components/features/finance/transaction-row";
import { RecurringRow } from "@/components/features/finance/recurring-row";
import { MonthPicker } from "@/components/ui/month-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCurrentMembership } from "@/hooks/use-current-membership";
import { useOrgSettings } from "@/hooks/use-org-settings";
import { isOrgAdminRole } from "@/lib/security/roles";
import { Colors } from "@/constants/theme";

type Segment = "transactions" | "recurring";

export default function FinanceIndexScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const membership = useCurrentMembership();
  const orgSettings = useOrgSettings();

  const [period, setPeriod] = useState(() => format(new Date(), "yyyy-MM"));
  const [segment, setSegment] = useState<Segment>("transactions");

  const summary = useQuery(api.finance.getSummary, { period });
  const transactions = useQuery(api.finance.getTransactions, { period });
  const recurringRules = useQuery(api.finance.getRecurringRules, {});

  if (
    orgSettings?.financeEnabled === false ||
    !isOrgAdminRole(membership?.role)
  ) {
    router.replace("/(tabs)/more" as any);
    return null;
  }

  const loading = summary === undefined;

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
              onPress={() =>
                router.push(
                  (segment === "transactions"
                    ? "/(tabs)/finance/transactions/new"
                    : "/(tabs)/finance/recurring/new") as any,
                )
              }
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

        <View style={styles.periodWrapper}>
          <MonthPicker value={period} onChange={setPeriod} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={isDark ? "#fff" : "#000"} />
          </View>
        ) : (
          <>
            <View style={styles.summaryWrapper}>
              <SummaryCards
                incomeArs={summary?.incomeArs ?? 0}
                expenseArs={summary?.expenseArs ?? 0}
                netResultArs={summary?.netResultArs ?? 0}
                activeRecurringRules={summary?.activeRecurringRules ?? 0}
              />
            </View>

            <View style={styles.segmentRow}>
              {(["transactions", "recurring"] as Segment[]).map((s) => (
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
                    {s === "transactions" ? "Movimientos" : "Recurrentes"}
                  </ThemedText>
                </ThemedPressable>
              ))}
            </View>

            {segment === "transactions" ? (
              transactions === undefined ? (
                <View style={styles.center}>
                  <ActivityIndicator color={isDark ? "#fff" : "#000"} />
                </View>
              ) : (transactions as any[]).length === 0 ? (
                <View style={styles.center}>
                  <EmptyState
                    title="Sin movimientos"
                    description="No hay transacciones en este período."
                  />
                </View>
              ) : (
                <FlashList
                  data={transactions as any[]}
                  keyExtractor={(t: any) => t._id}
                  contentContainerStyle={styles.listContent}
                  ItemSeparatorComponent={() => (
                    <View style={{ height: 8 }} />
                  )}
                  renderItem={({ item }: any) => (
                    <TransactionRow
                      title={item.title}
                      category={item.category}
                      occurredOn={item.occurredOn}
                      amountArs={item.amountArs}
                      type={item.type}
                      voided={item.voidedAt != null}
                      onPress={() =>
                        router.push({
                          pathname:
                            "/(tabs)/finance/transactions/[transactionId]" as any,
                          params: { transactionId: item._id },
                        })
                      }
                    />
                  )}
                />
              )
            ) : recurringRules === undefined ? (
              <View style={styles.center}>
                <ActivityIndicator color={isDark ? "#fff" : "#000"} />
              </View>
            ) : (recurringRules as any[]).length === 0 ? (
              <View style={styles.center}>
                <EmptyState
                  title="Sin reglas recurrentes"
                  description="No hay reglas configuradas."
                />
              </View>
            ) : (
              <FlashList
                data={recurringRules as any[]}
                keyExtractor={(r: any) => r._id}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }: any) => (
                  <RecurringRow
                    title={item.title}
                    category={item.category}
                    type={item.type}
                    amountArs={item.amountArs}
                    dayOfMonth={item.dayOfMonth}
                    status={item.status}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/finance/recurring/[ruleId]" as any,
                        params: { ruleId: item._id },
                      })
                    }
                  />
                )}
              />
            )}
          </>
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
  periodWrapper: { paddingHorizontal: 20, marginBottom: 12 },
  summaryWrapper: { paddingHorizontal: 20, marginBottom: 12 },
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
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
});
