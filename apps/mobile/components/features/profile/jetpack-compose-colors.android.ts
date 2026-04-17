import { processColor } from "react-native";
import type { ListItemColors } from "@expo/ui/jetpack-compose";

export function toAndroidListItemColors(colors: ListItemColors): ListItemColors {
  const result: Partial<Record<keyof ListItemColors, unknown>> = {};

  for (const [key, value] of Object.entries(colors) as [
    keyof ListItemColors,
    ListItemColors[keyof ListItemColors],
  ][]) {
    if (value == null) continue;

    const processed = processColor(value);
    if (processed != null) {
      result[key] = processed;
    }
  }

  return result as ListItemColors;
}
