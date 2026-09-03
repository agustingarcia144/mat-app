import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex";
import QRCode from "react-native-qrcode-svg";
import { usePreventScreenCapture } from "expo-screen-capture";
import { LinearGradient } from "expo-linear-gradient";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getRewardTheme, REWARD_ACCENT } from "@/components/features/rewards";

export default function MemberQrScreen() {
  usePreventScreenCapture("member-rewards-qr");
  const isDark = useColorScheme() === "dark";
  const theme = getRewardTheme(isDark);
  const issueQr = useMutation(api.rewards.issueMyMobileQr);
  const [payload, setPayload] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const retryAfterRef = useRef(0);

  const refresh = useCallback(
    async (force = false) => {
      if (
        refreshingRef.current ||
        (!force && Date.now() < retryAfterRef.current)
      ) {
        return;
      }
      refreshingRef.current = true;
      try {
        const result = await issueQr({});
        setPayload(result.payload);
        setExpiresAt(result.expiresAt);
        setError(null);
        retryAfterRef.current = 0;
      } catch (caught) {
        setPayload(null);
        retryAfterRef.current = Date.now() + 10_000;
        setExpiresAt(Date.now() + 20_000);
        setError(
          caught instanceof Error &&
            caught.message.includes("CONFIGURATION_REQUIRED")
            ? "El gimnasio todavía debe configurar los códigos de ingreso."
            : "No pudimos generar el código. Revisá tu conexión.",
        );
      } finally {
        refreshingRef.current = false;
      }
    },
    [issueQr],
  );

  useEffect(() => {
    refresh(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(true);
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (expiresAt && remaining <= 10) refresh();
    }, 1_000);
    return () => clearInterval(timer);
  }, [expiresAt, refresh]);

  return (
    <LinearGradient
      colors={isDark ? ["#171318", "#0A0A0A"] : ["#FFF0EA", "#FAFAFA"]}
      style={styles.container}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: theme.orangeSoft }]}>
          <MaterialIcons name="qr-code-2" size={29} color={REWARD_ACCENT} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          Presentá este código
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          El código cambia automáticamente y solo sirve para tu gimnasio activo.
        </Text>
        <View style={styles.qrFrame}>
          {payload ? (
            <QRCode
              value={payload}
              size={230}
              ecl="M"
              backgroundColor="#fff"
              color="#000"
            />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ActivityIndicator size="large" color={REWARD_ACCENT} />
          )}
        </View>
        {payload && (
          <Text
            style={[
              styles.timer,
              { color: seconds <= 15 ? "#DC2626" : REWARD_ACCENT },
            ]}
          >
            <MaterialIcons name="autorenew" size={15} /> Se actualiza en{" "}
            {seconds}s
          </Text>
        )}
        {error ? (
          <Pressable
            style={styles.retryButton}
            onPress={() => refresh(true)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        ) : null}
        <View style={[styles.noteBox, { backgroundColor: theme.orangeSoft }]}>
          <MaterialIcons name="shield" size={17} color={REWARD_ACCENT} />
          <Text style={[styles.note, { color: theme.muted }]}>
            No compartas capturas. Recepción verificará tu nombre y foto al
            escanear.
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  card: {
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  title: {
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" },
  qrFrame: {
    marginTop: 24,
    width: 270,
    height: 270,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  timer: { marginTop: 18, fontSize: 13, fontWeight: "800" },
  retryButton: {
    marginTop: 16,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: REWARD_ACCENT,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "#FFFFFF", fontWeight: "800" },
  noteBox: {
    marginTop: 17,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  note: { flex: 1, fontSize: 12, lineHeight: 17 },
  error: { color: "#991b1b", textAlign: "center", lineHeight: 20 },
});
