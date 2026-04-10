import { useRouter } from "expo-router";
import { PressableScale } from "pressto";
import { StyleSheet, useColorScheme } from "react-native";
import { IconSymbol } from "./icon-symbol";

const SIZE = 36;

export default function HeaderBackButton() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const tint = isDark ? "#fff" : "#000";

  return (
    <PressableScale
      onPress={() => router.back()}
      style={styles.circle}
      hitSlop={12}
    >
      <IconSymbol name="chevron.left" size={22} color={tint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
