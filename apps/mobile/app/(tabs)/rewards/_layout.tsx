import { Stack } from "expo-router";
import HeaderBackButton from "@/components/ui/header-back-button";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getRewardTheme } from "@/components/features/rewards";

export default function RewardsLayout() {
  const isDark = useColorScheme() === "dark";
  const theme = getRewardTheme(isDark);
  const detailOptions = {
    headerShown: true,
    headerTransparent: true,
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerLeft: () => <HeaderBackButton />,
  } as const;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="catalog"
        options={{ ...detailOptions, title: "Beneficios" }}
      />
      <Stack.Screen
        name="activity"
        options={{ ...detailOptions, title: "Actividad" }}
      />
      <Stack.Screen
        name="reward/[rewardId]"
        options={{ ...detailOptions, title: "Detalle del beneficio" }}
      />
      <Stack.Screen
        name="qr"
        options={{
          ...detailOptions,
          title: "Mi código de ingreso",
        }}
      />
    </Stack>
  );
}
