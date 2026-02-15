import type { PropsWithChildren, ReactElement } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated'

import { useColorScheme } from '@/hooks/use-color-scheme'
import { useThemeColor } from '@/hooks/use-theme-color'

const HEADER_HEIGHT = 360
const CARD_OVERLAP = 24
const CARD_BORDER_RADIUS = 24

type Props = PropsWithChildren<{
  headerImage: ReactElement
  headerBackgroundColor: { dark: string; light: string }
  /** Extra padding at bottom of the card (e.g. for sticky footer). */
  contentBottomPadding?: number
}>

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
  contentBottomPadding = 24,
}: Props) {
  const backgroundColor = useThemeColor({}, 'background')
  const colorScheme = useColorScheme() ?? 'light'
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  const scrollOffset = useScrollOffset(scrollRef)
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT * 0.3, 0, HEADER_HEIGHT * 0.5]
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [1.15, 1, 1]
          ),
        },
      ],
    }
  })

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={{ backgroundColor, flex: 1 }}
      contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      scrollEventThrottle={16}
    >
      <Animated.View
        style={[
          styles.header,
          { backgroundColor: headerBackgroundColor[colorScheme] },
          headerAnimatedStyle,
        ]}
      >
        {headerImage}
      </Animated.View>
      <View
        style={[
          styles.card,
          {
            backgroundColor,
            marginTop: -CARD_OVERLAP,
            borderTopLeftRadius: CARD_BORDER_RADIUS,
            borderTopRightRadius: CARD_BORDER_RADIUS,
            paddingBottom: contentBottomPadding,
          },
        ]}
      >
        {children}
      </View>
    </Animated.ScrollView>
  )
}

const styles = StyleSheet.create({
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  card: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    minHeight: 400,
  },
})
