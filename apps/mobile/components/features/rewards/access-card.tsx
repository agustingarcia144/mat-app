import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RewardsData } from "./model";
import { REWARD_ACCENT, getRewardTheme } from "./reward-theme";

type Props = {
  data: RewardsData;
  isDark: boolean;
  working: string | null;
  onOpenQr: () => void;
  onAddWallet: (provider: "apple" | "google") => void;
};

export function AccessCard({
  data,
  isDark,
  working,
  onOpenQr,
  onAddWallet,
}: Props) {
  const theme = getRewardTheme(isDark);
  const qrReady = data.access.allowed && data.wallet.qrConfigured;
  const provider =
    Platform.OS === "ios" && data.wallet.appleConfigured
      ? ("apple" as const)
      : Platform.OS === "android" && data.wallet.googleConfigured
        ? ("google" as const)
        : null;

  const warning = !data.access.allowed
    ? "Tu membresía o plan requiere atención. Contactá al gimnasio antes de ingresar."
    : !data.wallet.qrConfigured
      ? "El gimnasio todavía debe configurar los códigos de ingreso."
      : null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: theme.orangeSoft }]}>
          <MaterialIcons name="qr-code-2" size={25} color={REWARD_ACCENT} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: theme.text }]}>
            Ingresar al gimnasio
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Tu acceso, siempre a mano
          </Text>
        </View>
      </View>

      <Pressable
        disabled={!qrReady}
        onPress={onOpenQr}
        accessibilityRole="button"
        accessibilityLabel="Mostrar código QR de ingreso"
        accessibilityState={{ disabled: !qrReady }}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: qrReady ? REWARD_ACCENT : theme.track },
          pressed && qrReady && styles.pressed,
        ]}
      >
        <MaterialIcons name="qr-code-scanner" size={21} color="#FFFFFF" />
        <Text style={styles.primaryText}>
          {data.access.allowed ? "Mostrar mi QR" : "Ingreso no disponible"}
        </Text>
      </Pressable>

      {provider ? (
        <Pressable
          disabled={working !== null}
          onPress={() => onAddWallet(provider)}
          accessibilityRole="button"
          accessibilityLabel={`Agregar a ${provider === "apple" ? "Apple Wallet" : "Google Wallet"}`}
          accessibilityState={{ disabled: working !== null }}
          style={({ pressed }) => [
            styles.walletButton,
            { borderColor: theme.border },
            pressed && styles.pressed,
          ]}
        >
          {working === provider ? (
            <ActivityIndicator color={theme.text} />
          ) : (
            <MaterialIcons name="wallet" size={20} color={theme.text} />
          )}
          <Text style={[styles.walletText, { color: theme.text }]}>
            Agregar a Wallet
          </Text>
        </Pressable>
      ) : null}

      {warning ? (
        <View style={[styles.warning, { backgroundColor: theme.dangerSoft }]}>
          <MaterialIcons name="info-outline" size={17} color="#EF4444" />
          <Text
            style={[
              styles.warningText,
              { color: isDark ? "#FCA5A5" : "#B91C1C" },
            ]}
          >
            {warning}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 2,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1 },
  title: { fontSize: 17, fontWeight: "800" },
  subtitle: { fontSize: 13, marginTop: 2 },
  primaryButton: {
    minHeight: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  walletButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  walletText: { fontWeight: "700" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  warning: {
    borderRadius: 14,
    padding: 11,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "600" },
});
