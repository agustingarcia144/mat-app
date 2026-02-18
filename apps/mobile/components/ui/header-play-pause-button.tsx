import { PressableScale } from 'pressto'
import { StyleSheet, useColorScheme } from 'react-native'
import { IconSymbol } from './icon-symbol'
import { useExerciseVideo } from '@/contexts/exercise-video-context'

const SIZE = 36

export default function HeaderPlayPauseButton() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const tint = isDark ? '#fff' : '#000'
  const { togglePlayPause, isPlaying } = useExerciseVideo()

  return (
    <PressableScale
      onPress={togglePlayPause}
      style={styles.circle}
      hitSlop={12}
    >
      <IconSymbol
        name={isPlaying ? 'pause.fill' : 'play.fill'}
        size={20}
        color={tint}
      />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
