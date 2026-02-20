import React from 'react'
import {
  View,
  Image,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { ThemedText } from '@/components/ui/themed-text'

const matWolfLooking = require('@/assets/images/mat-wolf-looking.png')

export interface EmptyStateProps {
  title: string
  description?: string
  /** Image size; default 120 */
  imageSize?: number
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export function EmptyState({
  title,
  description,
  imageSize = 120,
  style,
  children,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <Image
        source={matWolfLooking}
        style={[styles.image, { width: imageSize, height: imageSize }]}
        resizeMode="contain"
        accessibilityLabel=""
      />
      <ThemedText style={styles.title}>{title}</ThemedText>
      {description ? (
        <ThemedText style={styles.description}>{description}</ThemedText>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  image: {
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.85,
  },
  actions: {
    marginTop: 20,
    alignItems: 'center',
  },
})
