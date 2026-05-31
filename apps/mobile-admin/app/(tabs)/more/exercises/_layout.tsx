import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function ExercisesLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Ejercicios" }} />
      <Stack.Screen name="new" options={{ title: "Nuevo ejercicio" }} />
      <Stack.Screen name="[exerciseId]" options={{ title: "Ejercicio" }} />
    </Stack>
  );
}
