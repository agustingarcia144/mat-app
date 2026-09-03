import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { REWARD_ACCENT, getRewardTheme } from "./reward-theme";

const happyWolf = require("@/assets/images/mat-wolf.png");

type Props = {
  visible: boolean;
  title: string;
  message: string;
  detail?: string;
  isDark: boolean;
  reducedMotion: boolean;
  onClose: () => void;
};

export function CelebrationModal({
  visible,
  title,
  message,
  detail,
  isDark,
  reducedMotion,
  onClose,
}: Props) {
  const theme = getRewardTheme(isDark);
  const { width } = useWindowDimensions();
  const celebratedRef = useRef(false);

  useEffect(() => {
    if (visible && !celebratedRef.current) {
      celebratedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (!visible) celebratedRef.current = false;
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
    >
      <View style={styles.backdrop}>
        {!reducedMotion ? (
          <ConfettiCannon
            count={120}
            origin={{ x: width / 2, y: -20 }}
            fadeOut
            autoStart
            explosionSpeed={320}
            fallSpeed={2600}
            colors={[REWARD_ACCENT, "#FBBF24", "#38BDF8", "#22C55E", "#FFFFFF"]}
          />
        ) : null}
        <View style={[styles.card, { backgroundColor: theme.surfaceRaised }]}>
          <View style={[styles.glow, { backgroundColor: theme.orangeSoft }]} />
          <Image
            source={happyWolf}
            style={styles.wolf}
            contentFit="contain"
            accessibilityLabel="Mati celebrando"
          />
          <Text style={[styles.eyebrow, { color: REWARD_ACCENT }]}>
            ¡LO LOGRASTE!
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.muted }]}>
            {message}
          </Text>
          {detail ? (
            <Text style={[styles.detail, { color: theme.text }]}>{detail}</Text>
          ) : null}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar celebración"
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Seguir</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 30,
    padding: 24,
    alignItems: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -150,
  },
  wolf: { width: 150, height: 130, marginTop: -4 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  title: { fontSize: 25, fontWeight: "900", textAlign: "center", marginTop: 7 },
  message: { fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 8 },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 12,
  },
  button: {
    marginTop: 22,
    minHeight: 50,
    alignSelf: "stretch",
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: REWARD_ACCENT,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
