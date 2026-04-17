/**
 * React 19 type compatibility overrides.
 *
 * React 19 `@types/react` changed class component types so that libraries
 * compiled against React 18 types (Picker, LinearGradient, etc.) no longer
 * satisfy the JSX element constraint.  The declarations below re-export
 * the affected components as function-component types so TypeScript accepts
 * them in JSX without losing prop checking.
 */

// ---------------------------------------------------------------------------
// @react-native-picker/picker
// ---------------------------------------------------------------------------
declare module "@react-native-picker/picker" {
  import type { ComponentType } from "react";
  import type { StyleProp, TextStyle, ViewProps, ColorValue } from "react-native";

  export type ItemValue = number | string | object;

  export interface PickerItemProps<T = ItemValue> {
    label?: string;
    value?: T;
    color?: string;
    fontFamily?: string;
    testID?: string;
    style?: StyleProp<TextStyle>;
    enabled?: boolean;
  }

  export interface PickerProps<T = ItemValue> extends ViewProps {
    style?: StyleProp<TextStyle>;
    selectedValue?: T;
    onValueChange?: (itemValue: T, itemIndex: number) => void;
    enabled?: boolean;
    mode?: "dialog" | "dropdown";
    itemStyle?: StyleProp<TextStyle>;
    selectionColor?: ColorValue;
    prompt?: string;
    testID?: string;
    dropdownIconColor?: number | ColorValue;
    dropdownIconRippleColor?: number | ColorValue;
    numberOfLines?: number;
    accessibilityLabel?: string;
    placeholder?: string;
    children?: React.ReactNode;
  }

  export const Picker: ComponentType<PickerProps> & {
    MODE_DIALOG: "dialog";
    MODE_DROPDOWN: "dropdown";
    Item: ComponentType<PickerItemProps>;
  };
}

// ---------------------------------------------------------------------------
// expo-linear-gradient
// ---------------------------------------------------------------------------
declare module "expo-linear-gradient" {
  import type { ComponentType } from "react";
  import type { ViewProps, ColorValue } from "react-native";

  export interface LinearGradientPoint {
    x: number;
    y: number;
  }

  export interface LinearGradientProps extends ViewProps {
    colors: readonly ColorValue[];
    locations?: readonly number[] | null;
    start?: LinearGradientPoint | null;
    end?: LinearGradientPoint | null;
    children?: React.ReactNode;
  }

  export const LinearGradient: ComponentType<LinearGradientProps>;
}
