import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  progress: number;
  value: string;
  label?: string;
  color: string;
  trackColor: string;
  textColor: string;
  size?: number;
  strokeWidth?: number;
  reducedMotion?: boolean;
};

export function ProgressRing({
  progress,
  value,
  label,
  color,
  trackColor,
  textColor,
  size = 132,
  strokeWidth = 11,
  reducedMotion = false,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useSharedValue(reducedMotion ? progress : 0);

  useEffect(() => {
    animatedProgress.value = reducedMotion
      ? progress
      : withTiming(progress, { duration: 700 });
  }, [animatedProgress, progress, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset:
      circumference * (1 - Math.max(0, Math.min(1, animatedProgress.value))),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityLabel={`${label ? `${label}, ` : ""}${value}`}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.content} pointerEvents="none">
        <Text
          style={[styles.value, { color: textColor }]}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {value}
        </Text>
        {label ? (
          <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: { position: "absolute" },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  value: { fontSize: 22, fontWeight: "900", textAlign: "center" },
  label: { fontSize: 11, fontWeight: "600", opacity: 0.75, marginTop: 1 },
});
