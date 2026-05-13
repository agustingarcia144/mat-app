import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function UsersLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Usuarios" }} />
      <Stack.Screen name="invite" options={{ title: "Invitar usuario" }} />
    </Stack>
  );
}
