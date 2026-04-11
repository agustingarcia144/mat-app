import { useColorScheme as useRNColorScheme } from "react-native";

/**
 * Wraps React Native's useColorScheme to normalize the "unspecified" value
 * (added in RN 0.83) into "light", keeping the return type as "light" | "dark".
 */
export function useColorScheme(): "light" | "dark" {
  const scheme = useRNColorScheme();
  if (scheme === "dark") return "dark";
  return "light";
}
