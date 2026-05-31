import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";

export function useNativeStackScreenOptions() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  return {
    headerStyle: {
      backgroundColor: isDark ? Colors.dark.background : Colors.light.background,
    },
    headerTintColor: isDark ? Colors.dark.text : Colors.light.text,
    headerTitleStyle: { fontWeight: "600" as const },
    headerShadowVisible: false,
  };
}
