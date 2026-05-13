import { useColorScheme as useRNColorScheme } from "react-native";

export function useColorScheme(): "light" | "dark" {
  const scheme = useRNColorScheme();
  if (scheme === "dark") return "dark";
  return "light";
}
