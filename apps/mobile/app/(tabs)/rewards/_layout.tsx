import { Stack } from "expo-router";
import HeaderBackButton from "@/components/ui/header-back-button";

export default function RewardsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="qr"
        options={{
          headerShown: true,
          title: "Mi código de ingreso",
          headerTransparent: true,
          headerShadowVisible: false,
          headerLeft: () => <HeaderBackButton />,
        }}
      />
    </Stack>
  );
}
