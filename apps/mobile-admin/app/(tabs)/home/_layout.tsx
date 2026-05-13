import { Stack } from "expo-router";

import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function HomeLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Inicio" }} />
    </Stack>
  );
}
