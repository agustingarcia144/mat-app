import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { PressableScale } from "pressto";

import { useThemeColor } from "@/hooks/use-theme-color";

export type ThemedPressableProps = ComponentProps<typeof PressableScale> & {
  lightColor?: string;
  darkColor?: string;
  type?: "primary" | "secondary" | "default" | "destructive";
  disabled?: boolean;
};

export function ThemedPressable({
  style,
  lightColor,
  darkColor,
  type = "default",
  disabled,
  enabled: enabledProp,
  ...rest
}: ThemedPressableProps) {
  const tintColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    "tint",
  );
  const destructiveBg = useThemeColor(
    { light: lightColor ?? "#dc2626", dark: darkColor ?? "#ef4444" },
    "background",
  );
  const secondaryBg = useThemeColor(
    { light: lightColor ?? "#e4e4e7", dark: darkColor ?? "#27272a" },
    "background",
  );
  const defaultOverrideBg = useThemeColor(
    { light: lightColor, dark: darkColor },
    "background",
  );
  const backgroundColor =
    type === "primary"
      ? tintColor
      : type === "secondary"
        ? secondaryBg
        : type === "destructive"
          ? destructiveBg
          : lightColor !== undefined || darkColor !== undefined
            ? defaultOverrideBg
            : undefined;

  return (
    <PressableScale
      enabled={enabledProp ?? !disabled}
      style={[
        type === "primary" && styles.primary,
        backgroundColor !== undefined && { backgroundColor },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
});
