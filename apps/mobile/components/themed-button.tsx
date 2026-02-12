import {
  TouchableOpacity,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native'

import { useThemeColor } from '@/hooks/use-theme-color'

export type ThemedButtonProps = TouchableOpacityProps & {
  lightColor?: string
  darkColor?: string
  type?: 'primary' | 'secondary' | 'default'
}

export function ThemedButton({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedButtonProps) {
  const tintColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    'tint'
  )
  const secondaryBg = useThemeColor(
    { light: lightColor ?? '#e4e4e7', dark: darkColor ?? '#27272a' },
    'background'
  )
  const defaultOverrideBg = useThemeColor(
    { light: lightColor, dark: darkColor },
    'background'
  )
  const backgroundColor =
    type === 'primary'
      ? tintColor
      : type === 'secondary'
        ? secondaryBg
        : lightColor !== undefined || darkColor !== undefined
          ? defaultOverrideBg
          : undefined

  return (
    <TouchableOpacity
      style={[
        type === 'primary' && styles.primary,
        backgroundColor !== undefined && { backgroundColor },
        style,
      ]}
      activeOpacity={rest.activeOpacity ?? 0.7}
      {...rest}
    />
  )
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
