import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function ClassesLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Clases" }} />
      <Stack.Screen name="[scheduleId]" options={{ title: "Detalle" }} />
    </Stack>
  );
}
