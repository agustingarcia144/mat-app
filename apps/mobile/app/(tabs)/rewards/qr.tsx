import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "@repo/convex";
import QRCode from "react-native-qrcode-svg";
import { usePreventScreenCapture } from "expo-screen-capture";
import { Colors } from "@/constants/theme";

export default function MemberQrScreen() {
  usePreventScreenCapture("member-rewards-qr");
  const colorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = Colors[colorScheme];
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: colorScheme === "dark" ? "#18181b" : "#fff" },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Presentá este código
        </Text>
        <Text style={[styles.subtitle, { color: colors.icon }]}>
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
            <ActivityIndicator size="large" color="#111827" />
          )}
        </View>
        {payload && (
          <Text
            style={[
              styles.timer,
              { color: seconds <= 15 ? "#dc2626" : colors.icon },
            ]}
          >
            Se actualiza en {seconds}s
          </Text>
        )}
        <Text style={[styles.note, { color: colors.icon }]}>
          No compartas capturas. Recepción verificará tu nombre y foto al
          escanear.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20 },
  card: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, textAlign: "center" },
  qrFrame: {
    marginTop: 28,
    width: 270,
    height: 270,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  timer: { marginTop: 18, fontSize: 14, fontWeight: "600" },
  note: { marginTop: 14, fontSize: 12, lineHeight: 17, textAlign: "center" },
  error: { color: "#991b1b", textAlign: "center", lineHeight: 20 },
});
