/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#000';
const tintColorDark = '#fff';

/** Semantic badge colors aligned with web design system */
export const BadgeColors = {
  success: {
    light: { bg: '#dcfce7', text: '#166534' },
    dark: { bg: 'rgba(34,197,94,0.22)', text: '#86efac' },
  },
  warning: {
    light: { bg: '#ffedd5', text: '#c2410c' },
    dark: { bg: 'rgba(234,88,12,0.22)', text: '#fdba74' },
  },
  destructive: {
    light: { bg: '#fee2e2', text: '#991b1b' },
    dark: { bg: 'rgba(239,68,68,0.22)', text: '#fca5a5' },
  },
} as const;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#525252',
    tabIconDefault: '#737373',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fafafa',
    background: '#0a0a0a',
    tint: tintColorDark,
    icon: '#a3a3a3',
    tabIconDefault: '#737373',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
