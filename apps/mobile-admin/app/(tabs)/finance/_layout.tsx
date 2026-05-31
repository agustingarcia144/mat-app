import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function FinanceLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Finanzas" }} />
      <Stack.Screen name="transactions/new" options={{ title: "Nueva transacción" }} />
      <Stack.Screen name="transactions/[transactionId]" options={{ title: "Transacción" }} />
      <Stack.Screen name="recurring/new" options={{ title: "Nueva regla recurrente" }} />
      <Stack.Screen name="recurring/[ruleId]" options={{ title: "Regla recurrente" }} />
    </Stack>
  );
}
