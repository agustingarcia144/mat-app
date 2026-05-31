import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function PaymentsLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Pagos" }} />
      <Stack.Screen name="record" options={{ title: "Registrar pago" }} />
      <Stack.Screen name="[paymentId]" options={{ title: "Detalle del pago" }} />
    </Stack>
  );
}
