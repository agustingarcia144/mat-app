import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function MetricsLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Métricas" }} />
      <Stack.Screen name="payments" options={{ title: "Métricas de pagos" }} />
      <Stack.Screen name="exercises" options={{ title: "Métricas de ejercicios" }} />
    </Stack>
  );
}
