import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/lib/navigation/native-stack-options";

export default function MembersLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: "Miembros", headerBackTitle: "" }} />
      <Stack.Screen name="[memberId]" options={{ title: "Detalle del miembro" }} />
    </Stack>
  );
}
