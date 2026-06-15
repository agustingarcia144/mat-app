import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Image as SvgImage
} from 'react-native-svg'

/**
 * The native tab bar can only show a raster image as an icon, and iOS does not
 * round it. To get the WhatsApp-style circular avatar we render the remote
 * image inside an <Svg> clipped to a circle, then rasterize it to a PNG data
 * URI via `toDataURL`. The parent feeds that data URI to the tab icon.
 *
 * `toDataURL` requires the <Svg> to be mounted and laid out in an on-screen
 * window, so this must be rendered inside a real (visible) view tree — not as a
 * sibling of a native navigator, which may never paint. We keep it on-screen
 * but underneath the rest of the UI (zIndex -1, opacity 0).
 */

// 28pt tab icon at @3x density.
export const AVATAR_PX = 84
export const AVATAR_SCALE = 10

type Props = {
  uri: string
  onReady: (dataUri: string) => void
}

export function CircularAvatarRasterizer({ uri, onReady }: Props) {
  const svgRef = useRef<React.ElementRef<typeof Svg>>(null)
  const captured = useRef(false)

  const capture = React.useCallback(() => {
    if (captured.current) return
    svgRef.current?.toDataURL?.((base64) => {
      if (base64 && !captured.current) {
        captured.current = true
        onReady(`data:image/png;base64,${base64}`)
      }
    })
  }, [onReady])

  // Fallback in case the SVG image `onLoad` event does not fire.
  useEffect(() => {
    const timers = [setTimeout(capture, 1200), setTimeout(capture, 2500)]
    return () => timers.forEach(clearTimeout)
  }, [capture])

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: AVATAR_PX,
        height: AVATAR_PX,
        opacity: 0,
        zIndex: -1
      }}
    >
      <Svg ref={svgRef} width={AVATAR_PX} height={AVATAR_PX}>
        <Defs>
          <ClipPath id="avatarClip">
            <Circle cx={AVATAR_PX / 2} cy={AVATAR_PX / 2} r={AVATAR_PX / 2} />
          </ClipPath>
        </Defs>
        <SvgImage
          href={{ uri }}
          width={AVATAR_PX}
          height={AVATAR_PX}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#avatarClip)"
          onLoad={() => {
            // Wait one frame so the image is painted before we rasterize.
            requestAnimationFrame(capture)
          }}
        />
      </Svg>
    </View>
  )
}
