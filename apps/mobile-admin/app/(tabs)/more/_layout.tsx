import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function MoreLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Más" }} />
      <Stack.Screen name="profile" options={{ title: "Perfil" }} />
      <Stack.Screen name="settings" options={{ title: "Configuración" }} />
      <Stack.Screen name="users" options={{ title: "Usuarios" }} />
      <Stack.Screen name="exercises" options={{ title: "Ejercicios" }} />
      <Stack.Screen name="finance" options={{ title: "Finanzas" }} />
      <Stack.Screen name="payments" options={{ title: "Pagos" }} />
      <Stack.Screen name="metrics" options={{ title: "Métricas" }} />
    </Stack>
  );
}
